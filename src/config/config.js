require('dotenv').config();

console.log('=== Environment Variables Debug ===');
console.log('BOT_TOKEN length:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.length : 0);
console.log('GEMINI_API_KEY length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
console.log('LUMA_API_KEY length:', process.env.LUMA_API_KEY ? process.env.LUMA_API_KEY.length : 0);

// Clean up tokens by removing whitespace
const cleanToken = (token) => token ? token.trim() : null;

const config = {
    telegram: {
        token: cleanToken(process.env.BOT_TOKEN),
        agentChannel: process.env.AGENT_CHANNEL
    },
    gemini: {
        apiKey: cleanToken(process.env.GEMINI_API_KEY),
        modelId: 'gemini-2.0-flash'
    },
    luma: {
        apiKey: cleanToken(process.env.LUMA_API_KEY),
        apiUrl: 'https://api.luma.com/v1'
    },
    bot: {
        name: 'Sonic Events Bot',
        version: '1.0.0'
    }
};

module.exports = config; 