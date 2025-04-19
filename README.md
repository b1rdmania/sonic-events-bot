# Sonic Events Bot

Natural Language Telegram bot for internal Team Sonic World Events management, using Telegraf, Airtable, and OpenAI.

## Features

*   Responds to natural language queries about events.
*   Provides specific commands for quick lookups (e.g., `/next`, `/thismonth`, region-specific commands like `/na`, `/eu`).
*   Uses OpenAI (GPT-4) to process natural language requests.
*   Fetches event data from Airtable.
*   Configurable to only respond when mentioned in group chats.
*   Responds to all messages in private chats.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/b1rdmania/sonic-events-bot.git
    cd sonic-events-bot
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the root directory and add the following variables:
    ```env
    BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
    AIRTABLE_API_KEY=YOUR_AIRTABLE_API_KEY
    AIRTABLE_BASE_ID=YOUR_AIRTABLE_BASE_ID
    OPENAI_API_KEY=YOUR_OPENAI_API_KEY
    ```
    *   Get `BOT_TOKEN` from BotFather on Telegram.
    *   Get Airtable credentials from your Airtable account (API Key is a Personal Access Token).
    *   Get `OPENAI_API_KEY` from OpenAI.

## Running Locally

*   **Development (with nodemon for auto-reloading):**
    ```bash
    npm run dev
    ```
*   **Production:**
    ```bash
    npm start
    ```

## Deployment (Heroku)

1.  **Install Heroku CLI:** [Instructions](https://devcenter.heroku.com/articles/heroku-cli)
2.  **Login to Heroku:**
    ```bash
    heroku login
    ```
3.  **Create Heroku App:**
    ```bash
    heroku create your-app-name
    ```
    *(If you already have an app, set the remote: `heroku git:remote -a your-app-name`)*
4.  **Set Environment Variables:**
    Set the same environment variables as in the `.env` file using Heroku's config vars:
    ```bash
    heroku config:set BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
    heroku config:set AIRTABLE_API_KEY=YOUR_AIRTABLE_API_KEY
    heroku config:set AIRTABLE_BASE_ID=YOUR_AIRTABLE_BASE_ID
    heroku config:set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
    ```
5.  **Create Procfile:**
    Create a file named `Procfile` (no extension) in the root directory with the following content:
    ```procfile
    worker: node src/bot.js
    ```
6.  **Commit and Deploy:**
    ```bash
    git add .
    git commit -m "Add Procfile and prepare for Heroku deployment"
    git push heroku main
    ```
7.  **Scale Dynos:**
    Ensure the worker dyno is running and the web dyno (if created by default) is turned off:
    ```bash
    heroku ps:scale worker=1 web=0
    ```

## Bot Behavior

*   **Private Chat:** Responds to all messages.
*   **Group Chat:** Only responds when mentioned directly (e.g., `@soniceventsbot what's next?`). Commands like `/next` will also work.

## License

MIT
