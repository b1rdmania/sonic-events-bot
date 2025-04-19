// const lumaClient = require('../../core/luma/client'); // No longer needed
const { requireLink } = require('../middleware/auth');
const guestService = require('../../core/services/guestService'); // Import service

const guestsCommandHandler = async (ctx) => {
  const { encryptedApiKey } = ctx.state;

  // Parse arguments: /guests <EVENT_ID> [status=approved|pending_approval|...]
  const args = ctx.message.text.split(' ').slice(1);
  const eventApiId = args[0];
  let statusFilter = null;

  if (!eventApiId) {
    return ctx.reply('Usage: /guests <EVENT_ID> [status=status_value]');
  }

  if (args[1] && args[1].startsWith('status=')) {
    statusFilter = args[1].split('=')[1];
  }

  try {
    await ctx.reply('Fetching guests...'); // Simplified message
    const options = {};
    if (statusFilter) {
      options.approval_status = statusFilter;
    }
    const replyMessage = await guestService.getEventGuests(encryptedApiKey, eventApiId, options);
    await ctx.replyWithMarkdownV2(replyMessage);
  } catch (error) {
    console.error(`Error in /guests command for event ${eventApiId}:`, error);
    // TODO: Escape error message for MarkdownV2?
    await ctx.reply(`Failed to fetch guests. Error: ${error.message}`);
  }
};

module.exports = {
  command: 'guests',
  handler: [requireLink, guestsCommandHandler],
}; 