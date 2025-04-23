import { config } from '../config/config.js';
import { Telegraf } from 'telegraf';
import { prisma } from '../core/db/prisma.js';
import { linkCommandHandler } from './commands/link.js';
import { command as eventsCommand, handler as eventsHandler } from './commands/events.js';
import { command as guestsCommand, handler as guestsHandler } from './commands/guests.js';
import { command as approveCommand, handler as approveHandler } from './commands/approve.js';
import { command as rejectCommand, handler as rejectHandler } from './commands/reject.js';
import { messageHandler, shouldRespond } from './handlers/messageHandler.js';
import { requireLink } from './middleware/auth.js';

// Basic validation
if (!config.telegram.botToken) {
  console.error('Error: BOT_TOKEN is not defined in environment variables.');
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(config.telegram.botToken);

// Middleware for basic logging
bot.use(async (ctx, next) => {
  const startTime = Date.now();
  await next(); // Continue processing
  const ms = Date.now() - startTime;
  const chatType = ctx.chat?.type || 'unknown';
  const userId = ctx.from?.id;
  console.log(`Response time for ${ctx.updateType} [${chatType} ${ctx.chat?.id || 'N/A'} / User ${userId}]: ${ms}ms`);
});

// --- Command Handlers Will Be Registered Here ---
bot.command('start', (ctx) => ctx.reply('Hello! I am the Luma Event Intelligence Bot. Use /link <YOUR_LUMA_API_KEY> to get started.'));
bot.command('link', linkCommandHandler); // Register the link command handler
bot.command(eventsCommand, ...eventsHandler); // Register the events command with middleware
bot.command(guestsCommand, ...guestsHandler); // Register the guests command with middleware
bot.command(approveCommand, ...approveHandler); // Register the approve command
bot.command(rejectCommand, ...rejectHandler); // Register the reject command

// Register the general message handler
// Apply middleware and the handler function individually
bot.on('text', shouldRespond, requireLink, messageHandler); // Correctly register middleware and handler

// Generic error handler
bot.catch((err, ctx) => {
  console.error(`Error processing update ${ctx.update.update_id}:`, err);
  // Attempt to notify the user, but be careful in groups
  if (ctx.chat?.type === 'private') {
    ctx.reply('Sorry, an unexpected error occurred. Please try again later.').catch(e => console.error('Failed to send error message to user:', e));
  }
});

// Function to launch the bot
async function startBot() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Database connected successfully.');

    console.log('Starting bot...');
    // Launch the bot
    await bot.launch();
    console.log('Bot started successfully!');

    // Enable graceful stop
    process.once('SIGINT', async () => {
      console.log('SIGINT received, stopping bot...');
      bot.stop('SIGINT');
      await prisma.$disconnect();
      console.log('Bot stopped and database disconnected.');
      process.exit(0);
    });
    process.once('SIGTERM', async () => {
      console.log('SIGTERM received, stopping bot...');
      bot.stop('SIGTERM');
      await prisma.$disconnect();
      console.log('Bot stopped and database disconnected.');
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start bot or connect to database:', error);
    await prisma.$disconnect().catch(e => console.error('Failed to disconnect database during startup error:', e));
    process.exit(1);
  }
}

// Start the bot process
startBot(); 