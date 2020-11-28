
import { IgApiClient, TimelineFeedResponseMedia_or_ad } from 'instagram-private-api'

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
export class Bot {
    config: BotConfig
    client: IgApiClient

    /**
     * Create an Instagram comment bot.
     * 
     * @param {BotConfig} config Bot configuration
     */
    constructor (config?: BotConfig) {
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
        this.client.state.generateDevice(this.config.username)
        await this.client.simulate.preLoginFlow()
        await this.client.account.login(this.config.username, this.config.password)
        await this.client.simulate.postLoginFlow()
        await this.processFeed()
    }

    /**
     * Get posts from feed and process them.
     * 
     * @private
     * 
     * @returns {Promise<void>} Fullfilled when all of the posts are processed.
     */
    private async processFeed (): Promise<void> {   
        try {
            const items = await this.client.feed.timeline('pull_to_refresh').items()
            await this.processMediaItems(items)
            await wait(60 * 1000 * (items.length === 0 ? 5 : 1))
        } catch (error) {
            console.error(error)
            await wait(60 * 60 * 1000)
        }

        this.processFeed()
    }


    /**
     * Process an array of media items.
     * 
     * @private
     * 
     * @param {TimelineFeedResponseMedia_or_ad[]} items Array of media items
     * 
     * @returns {Promise<void>} Fullfilled when the items are processed.
     */
    private async processMediaItems (items: TimelineFeedResponseMedia_or_ad[]): Promise<void> {
        for (const item of items) {
            await this.processMediaItem(item)
        }
    }

    /**
     * Process a media item.
     * 
     * @private
     * 
     * @param item Media item
     * 
     * @returns {Promise<void>} Fullfilled when the media item has been processed.
     */
    private async processMediaItem (item: TimelineFeedResponseMedia_or_ad): Promise<void> {
        if (item.has_liked) return

        const mediaId = item.id
        const text = this.randomComment()
        const likeTimeout = (10 + (Math.random() * 6)) * 1000
        const commentTimeout = (60 + (Math.random() * 30)) * 1000

        try {
            await this.client.media.like({ d: 1, mediaId, moduleInfo: { module_name: 'feed_timeline' }})
            await wait(likeTimeout)
            await this.client.media.comment({ mediaId, text })
            await wait(commentTimeout)
        } catch (error) {
            console.error(error)
            await wait(60 * 60 * 1000)
        }
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
