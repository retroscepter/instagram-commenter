# instagram-commenter [![Build Status](https://travis-ci.com/chewyiscrunchy/instagram-commenter.svg?branch=main)](https://travis-ci.com/chewyiscrunchy/instagram-commenter)

A CLI tool that automatically comments on posts in an Instagram account's feed.

## Installation

Clone the repository with git:

```Bash
git clone https://github.com/chewyiscrunchy/instagram-commenter.git
```

Install the required dependencies and create the configuration:

```Bash
cd instagram-commenter
npm ci
npm run setup
```

## Usage

Update your `.env` file with your credentials:

```env
USERNAME=instagram
PASSWORD=1234567890
```

Update your `comments.txt` file with the comments you want to use. Each comment is separated by a new-line:

```text
hi
hey
hello
```

Start the bot:

```Bash
npm start
```
