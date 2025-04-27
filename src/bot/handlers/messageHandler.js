const { resolveQuery, formatDataWithGemini, postProcessResponse } = require('../../core/nlp/geminiService');
const lumaClient = require('../../core/luma/client');
const { requireLink } = require('../middleware/auth');
const prisma = require('../../core/db/prisma');
const { escapeMarkdownV2 } = require('../../core/services/escapeUtil');

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
    // 1. Fetch event context (IDs and then details - unchanged)
    let eventContext = [];
    let eventIds = [];
    try {
      const eventsResult = await lumaClient.listEvents(encryptedApiKey, {});
      if (eventsResult?.entries) {
        eventIds = eventsResult.entries.map(e => e.api_id).filter(id => !!id);
      }
      console.log(`Fetched ${eventIds.length} event IDs.`);
    } catch (eventListError) {
      console.error("Failed to fetch event ID list:", eventListError);
      return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, I couldn\'t fetch the list of events needed to understand your request.'));
    }
    if (eventIds.length > 0) {
      console.log(`Fetching details for ${eventIds.length} events...`);
      const eventDetailPromises = eventIds.map(id =>
        lumaClient.getEvent(encryptedApiKey, id).catch(err => {
          console.error(`Failed to fetch details for event ${id}:`, err);
          return null;
        })
      );
      const eventDetailsResults = await Promise.all(eventDetailPromises);
      eventContext = eventDetailsResults
        .filter(event => event !== null)
        .map(e => ({
          api_id: e.api_id,
          name: e.name,
          start_at: e.start_at
        }));
      console.log(`Successfully fetched details for ${eventContext.length} events.`);
    } else {
      console.log("No event IDs found to fetch details for.");
    }
    console.log('Context being passed to Gemini service:', JSON.stringify({ events: eventContext }, null, 2));
    console.log("User text being passed to resolveQuery:", userText);

    // 2. Call the primary resolver function
    const resolveResult = await resolveQuery(userText, { events: eventContext });

    let rawResponseText = ""; // Text before post-processing

    // 3. Check if it's a tool call or direct answer
    if (typeof resolveResult === 'object' && resolveResult.action === 'TOOL_CALL') {
        console.log("Handler: Received TOOL_CALL instruction:", resolveResult);
        await ctx.replyWithChatAction('typing');
        const { tool, params } = resolveResult;

        try {
            let rawData = null;
            let actionResultText = null;

            switch (tool) {
                case 'getGuests':
                    if (!params.event_id) throw new Error('Missing event_id for getGuests tool call.');
                    console.log(`Tool Call: Executing getGuests for event ${params.event_id} with filter ${params.status_filter}`);
                    rawData = await lumaClient.getGuests(encryptedApiKey, params.event_id, { approval_status: params.status_filter });
                    break;
                case 'getEvent':
                    if (!params.event_id) throw new Error('Missing event_id for getEvent tool call.');
                    console.log(`Tool Call: Executing getEvent for event ${params.event_id}`);
                    rawData = await lumaClient.getEvent(encryptedApiKey, params.event_id);
                    break;
                case 'updateGuestStatus':
                    if (!params.event_id || !params.guest_email || !params.new_status) throw new Error('Missing required parameters for updateGuestStatus');
                    if (params.new_status !== 'approved' && params.new_status !== 'declined') throw new Error(`Invalid new_status '${params.new_status}'`);
                    console.log(`Tool Call: Executing updateGuestStatus for event ${params.event_id}, guest ${params.guest_email} to ${params.new_status}`);
                    const updateResult = await lumaClient.updateGuestStatus(encryptedApiKey, params.event_id, params.guest_email, params.new_status);
                    console.log("updateGuestStatus API Result:", updateResult);
                    // Create a simple success message - post-processing will refine tone
                    actionResultText = `Okay, I've updated the status for guest ${params.guest_email} to ${params.new_status} for event ${params.event_id}.`;
                    break;
                default:
                    console.warn(`Unknown tool requested by resolveQuery: ${tool}`);
                    actionResultText = `Sorry, I received a request for an unknown action ('${tool}').`;
                    break;
            }

            // Format data if needed, otherwise use action result text
            if (rawData !== null) {
                 console.log(`Tool Call Result (${tool}):`, JSON.stringify(rawData, null, 2));
                 rawResponseText = await formatDataWithGemini(rawData, userText); // Format the data from the tool call
            } else if (actionResultText !== null) {
                rawResponseText = actionResultText;
            }

        } catch (toolError) {
            console.error(`Error executing tool ${tool}:`, toolError);
            // Use a simple error message, let post-processing refine tone
            rawResponseText = `Sorry, I encountered an error trying to ${tool}: ${toolError.message}`;
        }
    } else if (typeof resolveResult === 'string') {
        // It's a direct answer from resolveQuery
        console.log("Handler: Received DIRECT_ANSWER text from resolveQuery");
        rawResponseText = resolveResult;
    } else {
        // Unexpected result from resolveQuery
        console.error("Handler: Received unexpected result from resolveQuery:", resolveResult);
        rawResponseText = "Sorry, I encountered an unexpected issue understanding your request.";
    }

    console.log("Response Text (Pre-Processing):", rawResponseText);

    // 4. Post-process the response for cleanup and natural tone
    const finalResponseText = await postProcessResponse(rawResponseText);
    console.log("Final Response Text (Post-Processing):", finalResponseText);

    // 5. Reply with the final, processed response text
    return ctx.replyWithMarkdownV2(escapeMarkdownV2(finalResponseText || "Sorry, I couldn't generate a response."));

  } catch (error) {
    console.error('Error in messageHandler:', error);
    return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, something went wrong while processing your request.'));
  }
};

module.exports = {
  messageHandler,
  shouldRespond
}; 