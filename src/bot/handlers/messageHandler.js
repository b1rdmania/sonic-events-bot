const { processNaturalLanguageQuery, formatDataWithGemini } = require('../../core/nlp/geminiService');
const lumaClient = require('../../core/luma/client');
const { requireLink } = require('../middleware/auth');
const prisma = require('../../core/db/prisma');
const eventService = require('../../core/services/eventService');
const guestService = require('../../core/services/guestService');
const { escapeMarkdownV2 } = require('../../core/services/escapeUtil');
const geminiService = require('../../core/nlp/geminiService');

/**
 * Middleware to check if the bot should respond to a message.
 * Responds only in private chats or when mentioned in group chats.
 */
const shouldRespond = async (ctx, next) => {
  if (ctx.chat?.type === 'private') {
    return next(); // Always respond in private chats
  }

  // Check if mentioned in group chats
  if (ctx.message?.entities) {
    const mention = ctx.message.entities.find(e => e.type === 'mention');
    if (mention) {
      const mentionText = ctx.message.text.substring(mention.offset, mention.offset + mention.length);
      // Check if the mention is the bot's username
      if (mentionText === `@${ctx.botInfo.username}`) {
        return next();
      }
    }
  }

  // Ignore message if not private and not mentioned
  console.log('Ignoring message in group - bot not mentioned.');
};

const messageHandler = async (ctx) => {
  const { encryptedApiKey, org } = ctx.state;
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;
  // const chatType = ctx.chat.type; // Potentially unused
  // const userId = ctx.from?.id; // Potentially unused

  await ctx.replyWithChatAction('typing');

  try {
    // 1. Fetch context (upcoming events)
    let eventContext = [];
    try {
      const eventsResult = await lumaClient.listEvents(encryptedApiKey, {});
      if (eventsResult?.entries) {
        eventContext = eventsResult.entries.map(e => ({
          api_id: e.api_id,
          name: e.name,
          start_at: e.start_at
        }));
      }
      console.log(`Fetched ${eventContext.length} events for context.`);
    } catch (eventError) {
      console.error("Failed to fetch event context:", eventError);
      // Proceed without context or return an error?
      // Let's proceed, Gemini might still answer general questions.
    }

    // Log the context object before passing it
    console.log('Context being passed to processNaturalLanguageQuery:', JSON.stringify({ events: eventContext }, null, 2));

    // 2. Call Gemini Service for Natural Language Response
    const responseText = await processNaturalLanguageQuery(userText, { events: eventContext });

    console.log("Raw Response from NLP Service:", responseText);

    // 3. Directly reply with the response (escaping for safety)
    // No need to check intent, errors, etc., as the NLP service handles that now
    // and returns a user-facing string.
    return ctx.replyWithMarkdownV2(escapeMarkdownV2(responseText));

    // --- REMOVE ALL OLD LOGIC BELOW --- 
    /*
    console.log("NLP Result:", JSON.stringify(nlpResult, null, 2));

    // 3. Process NLP Result (Errors and Clarifications first)
    if (nlpResult.error) { ... }
    if (nlpResult.intent === 'BLOCKED') { ... }
    if (nlpResult.requires_clarification && nlpResult.clarification_prompt) { ... }

    // 4. Event ID Validation/Resolution (Simplified)
    let resolvedEventId = ...
    const needsEvent = ...
    if (needsEvent && !resolvedEventId) { ... }

    // --- Intent Routing (using resolvedEventId from NLP) --- 
    await ctx.replyWithChatAction('typing');
    switch (nlpResult.intent) {
      case 'LIST_EVENTS':
         // ... (removed) ...
      case 'GET_GUESTS':
         // ... (removed) ...
      case 'GET_GUEST_COUNT':
         // ... (removed) ...
      case 'APPROVE_GUEST':
         // ... (removed) ...
      case 'REJECT_GUEST': // Assuming typo fix from DECLINE_GUEST?
         // ... (removed) ...
      case 'GET_EVENT_DETAILS':
         // ... (removed) ...
      case 'UNKNOWN':
      default:
        return ctx.replyWithMarkdownV2(escapeMarkdownV2("Sorry, I didn't understand that. Can you please rephrase?"));
    }
    */

  } catch (error) {
    // General error handler for the entire process
    console.error('Error in messageHandler:', error);
    // Send a generic error message back to the user
    return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, something went wrong while processing your request.'));
  }
};

module.exports = {
  messageHandler,
  shouldRespond // Export middleware if used directly by bot setup
}; 