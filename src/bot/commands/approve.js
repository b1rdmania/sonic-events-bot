// const lumaClient = require('../../core/luma/client'); // No longer needed
import { requireLink } from '../middleware/auth.js';
// const prisma = require('../../core/db/prisma'); // No longer needed directly for audit
import { guestService } from '../../core/services/guestService.js';

const approveCommandHandler = async (ctx) => {
  const { encryptedApiKey, org } = ctx.state;

  // Parse arguments: /approve <EVENT_ID> <GUEST_EMAIL>
  const args = ctx.message.text.split(' ').slice(1);
  const eventApiId = args[0];
  const guestEmail = args[1];

  if (!eventApiId || !guestEmail) {
    return ctx.reply('Usage: /approve <EVENT_ID> <GUEST_EMAIL>');
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return ctx.reply('Invalid email address format.');
  }

  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const userId = ctx.from?.id;

  try {
    await ctx.reply(`Approving ${guestEmail} for event ${eventApiId}...`);

    // Pass audit context to the service
    const auditContext = {
      orgId: org.id,
      userId: chatType === 'private' ? userId : null,
      groupId: chatType !== 'private' ? chatId : null,
    };

    const successMessage = await guestService.approveGuest(encryptedApiKey, eventApiId, guestEmail, auditContext);

    await ctx.replyWithMarkdownV2(successMessage);

  } catch (error) {
    // Service function handles logging and audit for failure
    console.error(`Error in /approve command handler:`, error);
    // Service function provides escaped error message
    await ctx.replyWithMarkdownV2(error.message);
  }
};

export const command = 'approve';
export const handler = [requireLink, approveCommandHandler]; 