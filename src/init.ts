
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { Bot } from '.'

config()

const COMMENT_FILE_PATH = path.join(__dirname, '../comments.txt')

const bot = new Bot({
    username: process.env.USERNAME || '',
    password: process.env.PASSWORD || '',
    comments: fs.readFileSync(COMMENT_FILE_PATH, 'utf-8').split(/\r?\n/)
})

bot.login()
