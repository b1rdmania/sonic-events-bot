require('dotenv').config();

const config = {
    telegram: {
        token: process.env.BOT_TOKEN,
        agentChannel: process.env.AGENT_CHANNEL // We'll add this to .env later
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4'
    },
    bot: {
        name: 'CoinWings',
        version: '1.0.0'
    }
};

module.exports = config; 