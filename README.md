# instagram-commenter [![Build Status](https://travis-ci.com/octavetoast/instagram-commenter.svg?branch=main)](https://travis-ci.com/octavetoast/instagram-commenter) [![view on npm](http://img.shields.io/npm/v/instagram-commenter.svg)](https://www.npmjs.org/package/instagram-commenter)

A CLI tool and API that automatically comments on posts in an Instagram account's feed.

## Installation

Install globally with the NPM package manager, you may need root privledges on Linux systems:

```Bash
npm install -g instagram-commenter
```

## Setup

Create a config file in the current directory:

```Bash
instagam-commenter init
```

Edit the `config.yml` to suit your needs:

```YAML
username: instagram       # Instagram username
password: password        # Instagram password
minLikeTimeout: 10        # Minimum timeout after each like (in seconds)
maxLikeTimeout: 30        # Maximum timeout after each like (in seconds)
minCommentTimeout: 60     # Minimum timeout after each comment (in seconds)
maxCommentTimeout: 180    # Maximum timeout after each comment (in seconds)
feedRefreshInterval: 5    # Feed refresh interval (in minutes)
comments:                 # List of comments to use
- hi
- hey
- hello
```

## Usage

Start the bot with your config file:

```Bash
instagram-commenter -c config.yml
```

If you want to persist cookies and state to prevent logging in every time the bot is started, define a state file:

```Bash
instagram-commenter -c config.yml -s state.json
```




