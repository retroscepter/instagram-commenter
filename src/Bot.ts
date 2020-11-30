
import { Logger } from 'tslog'
import { EventEmitter } from 'events'
import { IgActionSpamError, IgApiClient, TimelineFeedResponseMedia_or_ad } from 'instagram-private-api'

/**
 * Bot configuration.
 */
export type BotConfig = {
    username: string
    password: string
    comments: string[]
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
export function validateBotConfig (config?: BotConfig): BotConfig {
    if (typeof config !== 'object' || config === null) throw new TypeError('Bot configuration must be an object')
    if (typeof config.username !== 'string' && !config.username) throw new TypeError('Username must be a string')
    if (typeof config.password !== 'string' && !config.password) throw new TypeError('Password must be a string')
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
     * @type {IgApiClient}
     */
    public client: IgApiClient

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
     * @type {TimelineFeedResponseMedia_or_ad[]}
     */
    public queue: TimelineFeedResponseMedia_or_ad[] = []

    /**
     * Create an Instagram comment bot.
     * 
     * @param {BotConfig} config Bot configuration
     */
    constructor (config?: BotConfig) {
        super()
        this.config = validateBotConfig(config)
        this.client = new IgApiClient()
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
        try {
            this.logger.info('Authenticating...')

            if (!this.client.state.cookieUserId) {
                this.client.state.generateDevice(this.config.username)
                await this.client.simulate.preLoginFlow()
                await this.client.account.login(this.config.username, this.config.password)
                await this.client.simulate.postLoginFlow()
            }
        } catch (error) {
            if (error.message.includes('challenge_required')) {
                await this.solveChallenge()
                return this.login()
            } else {
                console.error(error)
                process.exit(0)
            }
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
        try {
            const items = await this.client.feed.timeline().items()
            const filtered = items.filter(item => !item.has_liked)
            for (const item of filtered) await this.queueItem(item)
            this.logger.info(`Refreshed feed and queued ${filtered.length} items`)
        } catch (error) {
            if (error instanceof IgActionSpamError) {
                await this.ratelimit()
            } else {
                this.logger.warn(`Couldn't refresh feed`)
            }
        }

        setTimeout(this.getFeed.bind(this), 1000 * 60 * 10)
    }

    /**
     * Process a media item.
     * 
     * @private
     * 
     * @param {TimelineFeedResponseMedia_or_ad} item Media item
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been processed.
     */
    private async processMediaItem (item: TimelineFeedResponseMedia_or_ad): Promise<void> {
        if (item.has_liked) return

        await this.likeMedia(item)
        await this.commentMedia(item)
    }

    /**
     * Like a media item.
     * 
     * @private
     * 
     * @param {TimelineFeedResponseMedia_or_ad} item Media item
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been liked. 
     */
    private async likeMedia (item: TimelineFeedResponseMedia_or_ad): Promise<void> {
        try {
            await this.client.media.like({ d: 1, mediaId: item.id, moduleInfo: { module_name: 'feed_timeline' }})
            await this.logger.info(`Liked post by ${item.user.username}`)
            await wait((60 + Math.floor(Math.random() * 60)) * 1000)
        } catch (error) {
            this.logger.warn(`Couldn't like post by ${item.user.username}`)
        }
    }

    /**
     * Comment on a media item.
     * 
     * @param {TimelineFeedResponseMedia_or_ad} item Media item
     * @param {string} [text] Comment text, random if not provided
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been commented on.
     */
    private async commentMedia (item: TimelineFeedResponseMedia_or_ad, text?: string): Promise<void> {
        try {
            await this.client.media.comment({ mediaId: item.id, text: text || this.randomComment() })
            await this.logger.info(`Commented on post by ${item.user.username}`)
            await wait((60 + Math.floor(Math.random() * 60)) * 1000)
        } catch (error) {
            if (error instanceof IgActionSpamError) {
                await this.ratelimit()
            } else {
                this.logger.warn(`Couldn't comment on post by ${item.user.username}`)
            }
        }
    }

    /**
     * Add a media item to the queue.
     * 
     * @public
     * 
     * @param {TimelineFeedResponseMedia_or_ad} item Media item
     * 
     * @returns {Promise<void>} Fullfilled after the item is queued.
     */
    public async queueItem (item: TimelineFeedResponseMedia_or_ad): Promise<void> {
        if (this.queue.some(i => i.id === item.id)) return
        this.queue.push(item)
    }

    /**
     * Remove a media item from the queue.
     * 
     * @public
     * 
     * @param {string | TimelineFeedResponseMedia_or_ad} item Media item or media ID
     * 
     * @returns {Promise<void>} Fullfilled after the item is removed.
     */
    public async unqueueItem (item: string | TimelineFeedResponseMedia_or_ad): Promise<void> {
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
        const sorted = this.queue.sort((a, b) => b.taken_at - a.taken_at)
        const item = sorted[0]

        if (!item) {
            setTimeout(this.processQueue.bind(this), 1000)
            return
        }

        await this.unqueueItem(item)
        await this.processMediaItem(item)
        setTimeout(this.processQueue.bind(this), 0)
    }

    /**
     * Start a checkpoint challenge flow.
     * 
     * @private
     * 
     * @returns {Promise<void>} Fullfilled when the challenge is solved.
     */
    public async solveChallenge (): Promise<void> {
        this.logger.info('Reading checkpoint...')

        await this.client.challenge.state()
        await this.client.challenge.auto()
        return new Promise((resolve, reject) => {
            this.emit('challenge', async (securityCode: string | number) => {
                try {
                    this.logger.info('Solving checkpoint...')
                    await this.client.challenge.sendSecurityCode(securityCode)
                    resolve()
                } catch (error) {
                    this.logger.warn('Security code is incorrect, please try again.')
                    reject(error)
                }
            })
        })
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
