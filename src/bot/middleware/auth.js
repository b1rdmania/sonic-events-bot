const prisma = require('../../core/db/prisma');

/**
 * Telegraf middleware to ensure the chat (group or private) is linked to an organization.
 * Fetches the Org record and attaches { org, encryptedApiKey } to ctx.state if linked.
 * Replies with an error message and stops processing if not linked.
 */
const requireLink = async (ctx, next) => {
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const userId = ctx.from?.id;

  let orgData = null;

  try {
    if (chatType === 'private') {
      if (!userId) throw new Error('User ID not found in private chat.');
      const user = await prisma.user.findUnique({
        where: { id: BigInt(userId) },
        include: { org: true }, // Include the related Org data
      });
      if (user?.org) {
        orgData = user.org;
      }
    } else { // group, supergroup, channel
      const group = await prisma.group.findUnique({
        where: { id: BigInt(chatId) },
        include: { org: true }, // Include the related Org data
      });
      if (group?.org) {
        orgData = group.org;
      }
    }

    if (orgData && orgData.lumaApiKeyEncrypted) {
      // Attach org data and the encrypted key to the context state
      ctx.state.org = orgData;
      ctx.state.encryptedApiKey = orgData.lumaApiKeyEncrypted;
      // Proceed to the next middleware or command handler
      return next();
    } else {
      // Not linked or API key missing
      console.warn(`Auth check failed: Chat ${chatId} (${chatType}) is not linked or API key is missing.`);
      await ctx.reply('This chat is not linked to a Luma account. Please use /link <YOUR_LUMA_API_KEY> first.');
      // Stop processing further middleware/handlers for this update
      return;
    }
  } catch (error) {
    console.error('Error during authentication middleware:', error);
    await ctx.reply('An internal error occurred while checking your account link.');
    return; // Stop processing
  }
};

module.exports = { requireLink }; 