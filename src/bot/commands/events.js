// const lumaClient = require('../../core/luma/client'); // No longer needed directly
import { requireLink } from '../middleware/auth.js';
import { eventService } from '../../core/services/eventService.js';

const eventsCommandHandler = async (ctx) => {
  const { encryptedApiKey } = ctx.state; // Org name is handled by the service now

  try {
    await ctx.reply('Fetching events from Luma...');

    const options = {}; // TODO: Add options parsing from command text
    const replyMessage = await eventService.listOrgEvents(encryptedApiKey, options);

    await ctx.replyWithMarkdownV2(replyMessage);

  } catch (error) {
    console.error('Error in /events command:', error);
    // TODO: Escape error message for MarkdownV2?
    await ctx.reply(`Failed to fetch events. Error: ${error.message}`);
  }
};

export const command = 'events';
export const handler = [requireLink, eventsCommandHandler]; 