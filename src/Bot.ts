
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
    state?: any
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
    if (config.state && typeof config.state !== 'object') throw new TypeError('State must be an object')
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
            console.log('Authenticating...')

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

        this.startTasks()
        this.emit('ready')
    }

    private async startTasks (): Promise<void> {
        this.getFeed()
        this.processQueue()
    }

    public async getFeed (): Promise<void> {
        if (this.queue.length > 0) {
            setTimeout(this.getFeed.bind(this), 1000 * 60)
            return
        }        

        const items = await this.client.feed.timeline().items()
        for (const item of items) this.queueItem(item)

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
        /* Skip if the post is more than an hour old */

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
            await wait((60 + Math.floor(Math.random() * 60)) * 1000)
        } catch (error) {
            console.error(error)
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
            await wait((60 + Math.floor(Math.random() * 60)) * 1000)
        } catch (error) {
            console.error(error)
            if (error instanceof IgActionSpamError) await wait(60 * 60 * 1000)
        }
    }

    public queueItem (item: TimelineFeedResponseMedia_or_ad): void {
        if (this.queue.some(i => i.id === item.id)) return
        this.queue.push(item)
    }

    public unqueueItem (item: string | TimelineFeedResponseMedia_or_ad): void {
        const index = this.queue.findIndex(i => i === item || i.id === item)
        if (index !== -1) this.queue.splice(index, 1)
    }

    public async processQueue (): Promise<void> {
        const sorted = this.queue.sort((a, b) => b.taken_at - a.taken_at)
        const item = sorted[0]

        if (!item) {
            setTimeout(this.processQueue.bind(this), 1000)
            return
        }

        this.unqueueItem(item)

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
        console.log('Reading checkpoint...')

        await this.client.challenge.state()
        await this.client.challenge.auto()
        return new Promise((resolve, reject) => {
            this.emit('challenge', async (securityCode: string | number) => {
                try {
                    await this.client.challenge.sendSecurityCode(securityCode)
                    resolve()
                } catch (error) {
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
}
