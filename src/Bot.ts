
import { Logger } from 'tslog'
import { EventEmitter } from 'events'
import { Client, Media } from 'instagram-connect'

const MIN_LIKE_TIMEOUT = 10
const MAX_LIKE_TIMEOUT = 30
const MIN_COMMENT_TIMEOUT = 60
const MAX_COMMENT_TIMEOUT = 180
const FEED_REFRESH_INTERVAL = 5

/**
 * Bot configuration.
 */
export type BotConfig = {
    username: string
    password: string
    comments: string[]
    minLikeTimeout?: number
    maxLikeTimeout?: number
    minCommentTimeout?: number
    maxCommentTimeout?: number
    feedRefreshInterval?: number
    whitelist?: string[]
    blacklist?: string[]
}

/**
 * Validate a Bot configuration object.
 * 
 * @param {BotConfig} config Bot configuration
 * 
 * @returns {BotConfig} Bot configuration.
 */
export function validateBotConfig (config: BotConfig): BotConfig {
    if (typeof config !== 'object' || config === null || !config) throw new TypeError('Bot configuration must be an object')
    if (typeof config.username !== 'string' || !config.username) throw new TypeError('Username must be a string')
    if (typeof config.password !== 'string' || !config.password) throw new TypeError('Password must be a string')
    if (!Array.isArray(config.comments)) throw new TypeError('Comments must be an array of strings')
    if (!Array.isArray(config.whitelist) && config.whitelist) throw new TypeError('Whitelist must be an array of strings')
    if (!Array.isArray(config.blacklist) && config.blacklist) throw new TypeError('Blacklist must be an array of strings')
    return config
}

/**
 * Async setTimeout helper.
 * 
 * @param ms Timeout in milliseconds
 * 
 * @returns {Promise<void>} Fullfilled when the timeout is completed.
 */
export function wait (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Random number helper.
 * 
 * @param from Starting range
 * @param to Ending range
 * 
 * @returns {number} Random number between starting and ending range.
 */
export function rand (from: number, to: number): number {
    return from + Math.floor(Math.random() * (to - from))
}

/**
 * Represents an Instagram comment bot.
 */
export class Bot extends EventEmitter {
    /**
     * Bot configuration.
     * 
     * @public
     * 
     * @type {BotConfig}
     */
    public config: BotConfig

    /**
     * Underlying Instagram API client.
     * 
     * @public
     * 
     * @type {Client}
     */
    public client: Client

    /**
     * Logger.
     * 
     * @public
     * 
     * @type {Logger}
     */
    public logger: Logger

    /**
     * Underlying queue array.
     * 
     * @private
     * 
     * @type {Media[]}
     */
    public queue: Media[] = []

    /**
     * Create an Instagram comment bot.
     * 
     * @param {BotConfig} config Bot configuration
     */
    constructor (config: BotConfig) {
        super()
        this.config = validateBotConfig(config)
        this.client = new Client({
            username: this.config.username,
            password: this.config.password,
            realtime: false
        })
        this.logger = new Logger({
            name: this.config.username,
            displayFilePath: 'hidden',
            displayFunctionName: false,
            type: 'pretty'
        })
    }

    /**
     * Login to Instagram and start the Bot.
     * 
     * @public
     * 
     * @returns {Promise<void>} Fullfilled when the Bot has logged in.
     */
    public async login (): Promise<void> {
        this.logger.info('Authenticating...')

        try {
            await this.client.login()
        } catch (error) {
            console.error(error)
            process.exit(0)
        }

        this.logger.info(`Logged in as ${this.config.username}`)

        this.startTasks()
        this.emit('ready')
    }

    /**
     * Start automated tasks.
     * 
     * @private
     * 
     * @returns {Promise<void>} Fullfilled when the tasks are started.
     */
    private async startTasks (): Promise<void> {
        await this.processQueue()
        await this.getFeed()
    }

    /**
     * Get all posts in the feed and add them to the queue.
     * 
     * @public
     * 
     * @returns {Promise<void>} Fullfilled when the posts are added to the queue.
     */
    public async getFeed (): Promise<void> {
        const timeout = 1000 * 60 * (this.config.feedRefreshInterval || FEED_REFRESH_INTERVAL)

        try {
            const count = this.queue.length
            const items = await this.client.timeline.get({ reason: 'pull_to_refresh' })
            for (const item of items) await this.queueItem(item)
            this.logger.info(`Refreshed feed and queued ${this.queue.length - count} items, next in ${Math.round(timeout / 1000)}s`)
        } catch (error) {
            this.logger.warn(`Couldn't refresh feed`)
            console.warn(error)
        }

        setTimeout(this.getFeed.bind(this), timeout)
    }

    /**
     * Process a media item.
     * 
     * @private
     * 
     * @param {Media} item Media item
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been processed.
     */
    private async processMediaItem (item: Media): Promise<void> {
        if (item.liked) return

        await this.likeMedia(item)
        await this.commentMedia(item)
    }

    /**
     * Like a media item.
     * 
     * @private
     * 
     * @param {Media} item Media item
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been liked. 
     */
    private async likeMedia (item: Media): Promise<void> {
        try {
            const timeout = rand(
                (this.config.minLikeTimeout || MIN_LIKE_TIMEOUT) * 1000,
                (this.config.maxLikeTimeout || MAX_LIKE_TIMEOUT) * 1000
            )
            await this.client.media.like({ mediaId: item.id, doubleTap: true, module: { name: 'feed_timeline' }})
            await this.logger.info(`Liked post by ${item.user?.username}, waiting ${Math.round(timeout / 1000)}s`)
            await wait(timeout)
        } catch (error) {
            this.logger.warn(`Couldn't like post by ${item.user?.username}`)
            console.warn(error)
        }
    }

    /**
     * Comment on a media item.
     * 
     * @param {Media} item Media item
     * @param {string} [text] Comment text, random if not provided
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been commented on.
     */
    private async commentMedia (item: Media, text?: string): Promise<void> {
        try {
            const timeout = rand(
                (this.config.minCommentTimeout || MIN_COMMENT_TIMEOUT) * 1000,
                (this.config.maxCommentTimeout || MAX_COMMENT_TIMEOUT) * 1000
            )
            await this.client.media.comment({ mediaId: item.id, text: text || this.randomComment() })
            await this.logger.info(`Commented on post by ${item.user?.username}, waiting ${Math.round(timeout / 1000)}s`)
            await wait(timeout)
        } catch (error) {
            this.logger.warn(`Couldn't comment on post by ${item.user?.username}`)
            console.warn(error)
        }
    }

    /**
     * Add a media item to the queue.
     * 
     * @public
     * 
     * @param {Media} item Media item
     * 
     * @returns {Promise<void>} Fullfilled after the item is queued.
     */
    public async queueItem (item: Media): Promise<void> {
        if (this.queue.some(i => i.id === item.id)) return
        if (item.liked) return
        if (item.adId) return
        this.queue.push(item)
    }

    /**
     * Remove a media item from the queue.
     * 
     * @public
     * 
     * @param {string | Media} item Media item or media ID
     * 
     * @returns {Promise<void>} Fullfilled after the item is removed.
     */
    public async unqueueItem (item: string | Media): Promise<void> {
        const index = this.queue.findIndex(i => i === item || i.id === item)
        if (index !== -1) this.queue.splice(index, 1)
    }

    /**
     * Process the next item in the queue.
     * 
     * @public
     * 
     * @returns {Promise<void>} Fullfilled when the item is processed.
     */
    public async processQueue (): Promise<void> {
        const sorted = this.queue.sort((a, b) => b.takenAt - a.takenAt)
        const item = sorted[0]

        if (!item) {
            setTimeout(this.processQueue.bind(this), 1000)
            return
        }

        try {
            await this.unqueueItem(item)
            await this.processMediaItem(item)
        } catch (error) {
            this.logger.warn(`Couldn't process queue item, skipping`)
            console.warn(error)
        }

        setTimeout(this.processQueue.bind(this), 0)
    }

    /**
     * Returns a random comment from the current config.
     * 
     * @private
     * 
     * @returns {string} Comment text.
     */
    private randomComment (): string {
        return this.config.comments[Math.floor(Math.random() * this.config.comments.length)]
    }

    /**
     * Logs a ratelimit error and waits the specified time.
     * 
     * @private
     * 
     * @param {number} [ms] Timeout in milliseconds, defaults to an hour
     * 
     * @returns {Promise<void>} Fullfilled after the timeout. 
     */
    private async ratelimit (ms?: number): Promise<void> {
        this.logger.warn('You have been ratelimited, pausing activity for an hour')
        await wait(ms || 60 * 60 * 1000)
    }
}
