require('dotenv').config();
const { Telegraf } = require('telegraf');
const { getEvents } = require('./airtable');
const OpenAI = require('openai');
const config = require('./config/config');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: config.openai.apiKey
});

// Initialize bot
const bot = new Telegraf(config.telegram.token);

// Error handling
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('An error occurred while processing your request.');
});

// Welcome message
bot.command('start', async (ctx) => {
    try {
        await ctx.reply(
            `✈️ Welcome to CoinWings – private aviation for the crypto jet set.\n\n` +
            `We fly fast, book discreetly, and accept crypto. 🚀\n\n` +
            `How can we help?`
        );
    } catch (error) {
        console.error('Error in start command:', error);
        ctx.reply('Sorry, there was an error processing your request.');
    }
});

// Basic message handling
bot.on('text', async (ctx) => {
    try {
        // Echo for now, we'll implement proper handling later
        await ctx.reply('Got your message. We\'ll implement proper handling soon!');
    } catch (error) {
        console.error('Error in message handler:', error);
        ctx.reply('Sorry, there was an error processing your message.');
    }
});

// Start bot
bot.launch()
    .then(() => {
        console.log('CoinWings bot is running...');
    })
    .catch((err) => {
        console.error('Error starting bot:', err);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));