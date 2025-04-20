const { generateDirectAnswerFromContext, determineAction, formatDataWithGemini } = require('../../core/nlp/geminiService');
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

    // Log the context object before passing it
    console.log('Context being passed to Gemini service:', JSON.stringify({ events: eventContext }, null, 2));

    // 2. Determine the required action using Gemini
    const actionDecision = await determineAction(userText, { events: eventContext });
    console.log("Action Decision from Gemini:", actionDecision);

    let responseText = "";

    // 3. Execute based on the decision
    if (actionDecision.action === 'TOOL_CALL' && actionDecision.tool && actionDecision.params) {
        await ctx.replyWithChatAction('typing'); // Indicate work for tool call
        const { tool, params } = actionDecision;

        try {
            let rawData = null;
            let actionResultText = null; // For actions that don't return data to format

            switch (tool) {
                case 'getGuests':
                    if (!params.event_id) throw new Error('Missing event_id for getGuests tool call.');
                    console.log(`Tool Call: Executing getGuests for event ${params.event_id} with filter ${params.status_filter}`);
                    rawData = await lumaClient.getGuests(encryptedApiKey, params.event_id, {
                        approval_status: params.status_filter
                    });
                    break;
                case 'getEvent':
                    if (!params.event_id) throw new Error('Missing event_id for getEvent tool call.');
                    console.log(`Tool Call: Executing getEvent for event ${params.event_id}`);
                    rawData = await lumaClient.getEvent(encryptedApiKey, params.event_id);
                    break;
                case 'updateGuestStatus':
                    if (!params.event_id || !params.guest_email || !params.new_status) {
                        throw new Error('Missing required parameters (event_id, guest_email, new_status) for updateGuestStatus tool call.');
                    }
                    if (params.new_status !== 'approved' && params.new_status !== 'declined') {
                        throw new Error(`Invalid new_status '${params.new_status}'. Must be 'approved' or 'declined'.`);
                    }
                    console.log(`Tool Call: Executing updateGuestStatus for event ${params.event_id}, guest ${params.guest_email} to ${params.new_status}`);
                    // We might want to add should_refund handling later if needed
                    const updateResult = await lumaClient.updateGuestStatus(encryptedApiKey, params.event_id, params.guest_email, params.new_status);
                    console.log("updateGuestStatus API Result:", updateResult);
                    // Generate a simple text response for success
                    actionResultText = `Successfully updated status for guest ${params.guest_email} to ${params.new_status} for event ${params.event_id}.`;
                    break;
                default:
                    console.warn(`Unknown tool requested: ${tool}`);
                    responseText = await generateDirectAnswerFromContext(userText, { events: eventContext });
                    // Ensure we don't try to format data below if we fell back here
                    rawData = null;
                    actionResultText = responseText;
                    break;
            }

            // If a tool returned data (getGuests/getEvent), format it
            if (rawData !== null) {
                 console.log(`Tool Call Result (${tool}):`, JSON.stringify(rawData, null, 2));
                 responseText = await formatDataWithGemini(rawData, userText);
            } else if (actionResultText !== null) {
                // If a tool returned a simple text result (updateGuestStatus)
                responseText = actionResultText;
            }
            // If responseText is still empty here, something went wrong or fallback occurred

        } catch (toolError) {
            console.error(`Error executing tool ${tool}:`, toolError);
            responseText = escapeMarkdownV2(`Sorry, I encountered an error while trying to perform the action '${tool}': ${toolError.message}`);
        }

    } else { // Default to DIRECT_ANSWER
        if (actionDecision.message) {
             console.log("Action Decision Message (defaulting to direct answer):", actionDecision.message);
        }
        console.log("Executing Direct Answer path...");
        responseText = await generateDirectAnswerFromContext(userText, { events: eventContext });
    }

    console.log("Final Response Text:", responseText);

    // 4. Reply with the final response text
    return ctx.replyWithMarkdownV2(escapeMarkdownV2(responseText || "Sorry, I couldn't generate a response."));

  } catch (error) {
    console.error('Error in messageHandler:', error);
    return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, something went wrong while processing your request.'));
  }
};

module.exports = {
  messageHandler,
  shouldRespond
}; 