#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import inquirer from 'inquirer'
import { Command } from 'commander'

import { Bot } from '.'

/* Parse cli options */

const program = new Command()

program
    .description('Starts the Instagram Commenter')
    .option('-u, --username [username]', 'Instagram account username')
    .option('-p, --password [password]', 'Instagram account password')
    .option('-c, --config <config>', 'Config file path')
    .option('-s, --state [state]', 'State cache path')
    .action(() => main())
    .command('init')
    .description('Creates a new config file in the current working directory')
    .option('-f, --force', 'Overwrite any existing config file')
    .action(async (cmd) => {
        /* Load default config */

        const defaultConfigPath = path.join(__dirname, '../assets/default.config.yml')
        const newConfigPath = path.join(process.cwd(), 'config.yml')

        /* Check if current config exists */

        if (!cmd.force && fs.existsSync(newConfigPath)) {
            const { overwrite } = await inquirer.prompt([{ name: 'overwrite', message: 'Overwrite existing config.yml?', type: 'confirm' }])
            if (!overwrite) process.exit(0)
        }

        /* Write config file */

        const data = fs.readFileSync(defaultConfigPath, 'utf-8')
        fs.writeFileSync(newConfigPath, data)

        console.log(`New config written to ${newConfigPath}`)
    })

/* Main function */

async function main () {
    /* Check if provided config file exists */

    if (!fs.existsSync(program.config)) {
        console.log('Config file doesn\'t exist!')
        process.exit(0)
    }

    /* Load config file */

    const loadedConfig = yaml.safeLoad(fs.readFileSync(program.config, 'utf-8'))

    if (typeof loadedConfig !== 'object' || !loadedConfig) {
        console.log('Config file is invalid!')
        process.exit(0)
    }

    /* Create initial config */

    const config = {
        username: process.env.USERNAME || program.username,
        password: process.env.PASSWORD || program.password,
        comments: [],
        ...loadedConfig
    }

    /* Create prompts */

    const prompts: inquirer.Question[] = []

    if (!config.username) prompts.push({ name: 'username', message: 'Username', type: 'input' })
    if (!config.password) prompts.push({ name: 'password', message: 'Password', type: 'password' })

    const answers = await inquirer.prompt(prompts)

    /* Update credentials from prompt answers */

    if (answers.username) config.username = answers.username
    if (answers.password) config.password = answers.password

    const bot = new Bot(config)

    /* Load state file */

    const stateFilePath = program.state

    if (stateFilePath && fs.existsSync(stateFilePath)) {
        try {
            const state = fs.readFileSync(stateFilePath, 'utf-8')
            await bot.client.state.deserialize(state)
        } catch (error) {
            console.log('State cache file is invalid')
            process.exit(0)
        }
    }

    /* Prompt for security code to solve challenges */

    bot.on('challenge', async function askForCode (solve) {
        try {
            const answers = await inquirer.prompt([{ name: 'securityCode', message: 'Security code', type: 'input' }])
            await solve(answers.securityCode)
        } catch {
            askForCode(solve)
        }
    })

    /* Write state to state file if provided */

    bot.client.request.end$.subscribe(async () => {
        if (stateFilePath) {
            const state = await bot.client.state.serialize()
            delete state.constants
            fs.writeFileSync(stateFilePath, JSON.stringify(state))
        }
    })

    /* Start the bot */

    await bot.login()
}

program.parse()
