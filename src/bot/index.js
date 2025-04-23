const { Telegraf } = require('telegraf');
const config = require('../config/config.js');
const geminiService = require('../core/nlp/geminiService');

console.log('=== Bot Initialization ===');
console.log('Starting with configuration:');
console.log('- BOT_TOKEN exists:', !!config.telegram.token);
console.log('- GEMINI_API_KEY exists:', !!config.gemini.apiKey);

// Basic validation
if (!config.telegram.token) {
  console.error('Error: BOT_TOKEN is not defined in environment variables.');
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(config.telegram.token);

// Middleware for basic logging
bot.use(async (ctx, next) => {
  const startTime = Date.now();
  console.log(`Received update: ${ctx.updateType}`);
  await next();
  const ms = Date.now() - startTime;
  console.log(`Response time for ${ctx.updateType}: ${ms}ms`);
});

// Basic commands
bot.start((ctx) => {
  console.log('Start command received');
  return ctx.reply('Hello! I am Sonic Events Bot. I can help you manage your Luma events.');
});

bot.help((ctx) => {
  console.log('Help command received');
  return ctx.reply(
    'I can help you manage Luma events.\n\n' +
    'Use these commands:\n' +
    '/start - Start the bot\n' +
    '/help - Show this help message'
  );
});

// Simple text response using Gemini
bot.on('text', async (ctx) => {
  console.log('Text message received:', ctx.message.text);
  try {
    await ctx.reply('Thinking...');
    const prompt = `You are a helpful assistant for a Telegram bot. The user sent this message: "${ctx.message.text}". Respond in a friendly and concise way.`;
    const response = await geminiService.generateResponse(prompt);
    return ctx.reply(response);
  } catch (error) {
    console.error('Error processing message:', error);
    return ctx.reply('Sorry, I encountered an error processing your message.');
  }
});

// Generic error handler
bot.catch((err, ctx) => {
  console.error(`Error processing update ${ctx.update.update_id}:`, err);
  return ctx.reply('Sorry, an error occurred. Please try again later.');
});

// Start the bot
console.log('Starting bot...');
bot.launch()
  .then(() => {
    console.log('Bot is running!');
  })
  .catch(err => {
    console.error('Failed to start bot:', err);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('SIGINT received, stopping bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('SIGTERM received, stopping bot...');
  bot.stop('SIGTERM');
}); 