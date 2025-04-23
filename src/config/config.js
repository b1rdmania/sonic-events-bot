import dotenv from 'dotenv';
dotenv.config();

export const config = {
    telegram: {
        token: process.env.BOT_TOKEN,
        agentChannel: process.env.AGENT_CHANNEL
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        modelId: 'gemini-2.0-flash'
    },
    luma: {
        apiKey: process.env.LUMA_API_KEY,
        apiUrl: 'https://api.luma.com/v1'
    },
    bot: {
        name: 'Sonic Events Bot',
        version: '1.0.0'
    }
}; 