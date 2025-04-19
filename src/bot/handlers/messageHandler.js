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

  await ctx.replyWithChatAction('typing');

  try {
    // 1. Fetch event IDs first
    let eventIds = [];
    try {
      const eventsResult = await lumaClient.listEvents(encryptedApiKey, {});
      if (eventsResult?.entries) {
        // Extract only the api_id from the list response
        eventIds = eventsResult.entries.map(e => e.api_id).filter(id => !!id); // Filter out any potential null/undefined IDs
      }
      console.log(`Fetched ${eventIds.length} event IDs.`);
    } catch (eventListError) {
      console.error("Failed to fetch event ID list:", eventListError);
      // Proceeding without context is problematic now as we need IDs
      // Consider sending an error message or allowing Gemini to respond without context
      return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, I couldn\'t fetch the list of events needed to understand your request.'));
    }

    // 2. Fetch full details for each event ID
    let eventContext = [];
    if (eventIds.length > 0) {
      console.log(`Fetching details for ${eventIds.length} events...`);
      const eventDetailPromises = eventIds.map(id =>
        lumaClient.getEvent(encryptedApiKey, id).catch(err => {
          console.error(`Failed to fetch details for event ${id}:`, err);
          return null; // Return null if fetching details fails for one event
        })
      );
      const eventDetailsResults = await Promise.all(eventDetailPromises);

      // Filter out nulls and map to the required structure
      eventContext = eventDetailsResults
        .filter(event => event !== null) // Remove events where detail fetch failed
        .map(e => ({
          api_id: e.api_id,
          name: e.name, // Should now exist
          start_at: e.start_at // Should now exist
          // Add other relevant fields if needed from getEvent response
        }));
      console.log(`Successfully fetched details for ${eventContext.length} events.`);
    } else {
      console.log("No event IDs found to fetch details for.");
    }


    // Log the context object before passing it (should now have names/dates)
    console.log('Context being passed to processNaturalLanguageQuery:', JSON.stringify({ events: eventContext }, null, 2));

    // 3. Call Gemini Service for Natural Language Response
    const responseText = await processNaturalLanguageQuery(userText, { events: eventContext });

    console.log("Raw Response from NLP Service:", responseText);

    // 4. Directly reply with the response (escaping for safety)
    return ctx.replyWithMarkdownV2(escapeMarkdownV2(responseText));

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