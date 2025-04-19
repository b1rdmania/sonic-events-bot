const { processNaturalLanguageQuery, formatDataWithGemini } = require('../../core/nlp/geminiService');
const lumaClient = require('../../core/luma/client');
const { requireLink } = require('../middleware/auth');
const prisma = require('../../core/db/prisma');
const eventService = require('../../core/services/eventService');
const guestService = require('../../core/services/guestService');
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

/**
 * Helper function to resolve an event ID from NLP entities and context.
 * @param {object} entities - Entities extracted by Gemini (e.g., { event_name: '...', event_id: '...' })
 * @param {Array<{api_id: string, name: string}>} eventContext - List of available events.
 * @returns {{ eventId: string | null, error: string | null, matches: Array<{api_id: string, name: string}> | null }} - Resolved ID, error message, or ambiguous matches.
 */
function resolveEventId(entities, eventContext) {
  if (entities?.event_id) {
    // Direct ID provided
    // Optional: Validate if the ID exists in the context?
    const found = eventContext.find(e => e.api_id === entities.event_id);
    if (found) {
        return { eventId: entities.event_id, error: null, matches: null };
    } else {
        console.warn(`Event ID ${entities.event_id} provided but not found in context.`);
        // Treat as not found, maybe the context is limited (e.g., only upcoming)
         return { eventId: null, error: `The specified event ID (${entities.event_id}) wasn't found in the list of available events.`, matches: null };
        // OR return { eventId: entities.event_id, error: null, matches: null }; // Trust the ID?
    }
  }

  if (entities?.event_name) {
    const nameToFind = entities.event_name.toLowerCase();
    const matches = eventContext.filter(e => e.name.toLowerCase().includes(nameToFind));

    if (matches.length === 1) {
      // Exact match found
      return { eventId: matches[0].api_id, error: null, matches: null };
    } else if (matches.length > 1) {
      // Ambiguous match
      console.log(`Ambiguous event name "${entities.event_name}": Found ${matches.length} matches.`);
      return { eventId: null, error: 'ambiguous', matches: matches };
    } else {
      // No match found
      console.log(`Event name "${entities.event_name}" not found in context.`);
      return { eventId: null, error: `Couldn't find an event matching "${entities.event_name}".`, matches: null };
    }
  }

  // No event ID or name provided when one was likely needed
  return { eventId: null, error: 'missing', matches: null };
}

const messageHandler = async (ctx) => {
  // Middleware should have attached org and encryptedApiKey
  const { encryptedApiKey, org } = ctx.state;
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const userId = ctx.from?.id;

  await ctx.replyWithChatAction('typing'); // Show typing indicator

  try {
    // 1. Fetch context (e.g., upcoming events)
    let eventContext = [];
    try {
      // Fetch minimal data needed for context
      const eventsResult = await lumaClient.listEvents(encryptedApiKey, { /* Consider limiting fields if possible */ });
      if (eventsResult?.entries) {
        eventContext = eventsResult.entries.map(e => ({ api_id: e.api_id, name: e.name }));
      }
    } catch (eventError) {
      console.error("Failed to fetch event context for NLP:", eventError);
    }

    // 2. Call Gemini Service for Intent/Entity Extraction
    const nlpResult = await processNaturalLanguageQuery(userText, { events: eventContext });

    console.log("NLP Result:", JSON.stringify(nlpResult, null, 2));

    // 3. Process NLP Result (Errors and Clarifications first)
    if (nlpResult.error) {
      // Still escape the error message from NLP service
      return ctx.replyWithMarkdownV2(escapeMarkdownV2(`Error processing your request: ${nlpResult.error}`));
    }
    if (nlpResult.intent === 'BLOCKED') {
        return ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, your request could not be processed due to safety restrictions.'));
    }
    if (nlpResult.requires_clarification && nlpResult.clarification_message) {
      // Send clarification message from NLP (already formatted)
      return ctx.replyWithMarkdownV2(escapeMarkdownV2(nlpResult.clarification_message));
    }

    // 4. Resolve Event ID if needed for the intent
    let resolvedEventId = nlpResult.entities?.event_id || null;
    let needsEvent = ['GET_GUESTS', 'GET_GUEST_COUNT', 'APPROVE_GUEST', 'REJECT_GUEST'].includes(nlpResult.intent);

    if (needsEvent && !resolvedEventId) {
        const resolution = resolveEventId(nlpResult.entities, eventContext);
        if (resolution.eventId) {
            resolvedEventId = resolution.eventId;
            console.log(`Resolved event ID: ${resolvedEventId} from name "${nlpResult.entities?.event_name}"`);
        } else if (resolution.error === 'ambiguous') {
            let clarification = `Which event did you mean?\n`;
            // Escape parts of the clarification message
            resolution.matches.forEach(m => clarification += `\- ${escapeMarkdownV2(m.name || 'Unnamed')} \(ID: \`${escapeMarkdownV2(m.api_id)}\`\)\n`);
            return ctx.replyWithMarkdownV2(clarification);
        } else if (resolution.error === 'missing') {
            return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify which event you are referring to (e.g., by name or ID).'));
        } else {
            // Escape the error string from resolveEventId
            return ctx.replyWithMarkdownV2(escapeMarkdownV2(resolution.error || 'Could not determine the event. Please specify the event ID.'));
        }
    }

    // --- Intent Routing --- 
    await ctx.replyWithChatAction('typing'); // Show typing before service call

    switch (nlpResult.intent) {
      case 'LIST_EVENTS':
        try {
          const eventData = await eventService.listOrgEvents(encryptedApiKey, {});
          if (!eventData || eventData.entries.length === 0) {
              return ctx.replyWithMarkdownV2(escapeMarkdownV2('No upcoming events found.'));
          }
          const instruction = "Present this list of Luma events clearly to the user. Include the event name, ID, and start time for each. Indicate if there are more events not shown.";
          const geminiFormattedResponse = await formatDataWithGemini(eventData, instruction);
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(geminiFormattedResponse)); // Escape Gemini's output
        } catch (error) {
          console.error('Error handling LIST_EVENTS intent:', error);
          // Escape the error message before sending
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(`Failed to list events. Error: ${error.message}`));
        }

      case 'GET_GUESTS':
        if (!resolvedEventId) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the event ID for getting guests.'));
        try {
          const options = {};
          if (nlpResult.entities?.status_filter) {
            options.approval_status = nlpResult.entities.status_filter;
          }
          const guestData = await guestService.getEventGuests(encryptedApiKey, resolvedEventId, options);
          if (!guestData || guestData.entries.length === 0) {
              let noneFoundMsg = `No guests found for event ${resolvedEventId}`;
              if (guestData?.statusFilter) noneFoundMsg += ` with status \"${guestData.statusFilter}\"`;
              noneFoundMsg += '.';
              return ctx.replyWithMarkdownV2(escapeMarkdownV2(noneFoundMsg));
          }
          const instruction = `Present this list of guests for event ${resolvedEventId}. Include name, email, and approval status. Note if the list is incomplete (has_more).`;
          if (guestData.statusFilter) instruction += ` (Filtered by status: ${guestData.statusFilter})`;
          const geminiFormattedResponse = await formatDataWithGemini(guestData, instruction);
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(geminiFormattedResponse)); // Escape Gemini's output
        } catch (error) {
          console.error(`Error handling GET_GUESTS intent for event ${resolvedEventId}:`, error);
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(`Failed to get guests. Error: ${error.message}`));
        }

      case 'GET_GUEST_COUNT':
        if (!resolvedEventId) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the event ID for getting guest counts.'));
        try {
          const options = {};
          if (nlpResult.entities?.status_filter) {
            options.approval_status = nlpResult.entities.status_filter;
          }
          const guestCountData = await guestService.getEventGuestCount(encryptedApiKey, resolvedEventId, options);
           if (!guestCountData) {
              let noneFoundMsg = `No guests found for event ${resolvedEventId}`;
              if (options.approval_status) noneFoundMsg += ` with status \"${options.approval_status}\"`;
              noneFoundMsg += '.';
              return ctx.replyWithMarkdownV2(escapeMarkdownV2(noneFoundMsg));
          }
          const instruction = `Present this guest count summary for event ${resolvedEventId}. Show the total and breakdown by status. Note if counts are based on partial data (has_more).`;
          if (guestCountData.statusFilter) instruction += ` (Filtered by status: ${guestCountData.statusFilter})`;
          const geminiFormattedResponse = await formatDataWithGemini(guestCountData, instruction);
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(geminiFormattedResponse)); // Escape Gemini's output
        } catch (error) {
          console.error(`Error handling GET_GUEST_COUNT intent for event ${resolvedEventId}:`, error);
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(`Failed to get guest counts. Error: ${error.message}`));
        }

      case 'APPROVE_GUEST':
        if (!resolvedEventId) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the event ID for approving.'));
        const guestEmailToApprove = nlpResult.entities?.guest_email;
        if (!guestEmailToApprove) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the guest email to approve.'));

        try {
          const auditContext = { orgId: org.id, userId, groupId: chatType !== 'private' ? chatId : null };
          const successMessage = await guestService.approveGuest(encryptedApiKey, resolvedEventId, guestEmailToApprove, auditContext);
          // Send simple success message, escaping it
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(successMessage));
        } catch (error) {
          console.error(`Error handling APPROVE_GUEST intent for event ${resolvedEventId}, guest ${guestEmailToApprove}:`, error);
          // Error message from service should already be simple text, escape it
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(error.message));
        }

      case 'REJECT_GUEST':
        if (!resolvedEventId) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the event ID for rejecting.'));
        const guestEmailToReject = nlpResult.entities?.guest_email;
        if (!guestEmailToReject) return ctx.replyWithMarkdownV2(escapeMarkdownV2('Please specify the guest email to reject.'));

        try {
          const auditContext = { orgId: org.id, userId, groupId: chatType !== 'private' ? chatId : null };
          const successMessage = await guestService.rejectGuest(encryptedApiKey, resolvedEventId, guestEmailToReject, auditContext);
          // Send simple success message, escaping it
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(successMessage));
        } catch (error) {
          console.error(`Error handling REJECT_GUEST intent for event ${resolvedEventId}, guest ${guestEmailToReject}:`, error);
          // Error message from service should already be simple text, escape it
          return ctx.replyWithMarkdownV2(escapeMarkdownV2(error.message));
        }

      case 'UNKNOWN':
      default:
        // Send clarification message from NLP or a default message
        return ctx.replyWithMarkdownV2(escapeMarkdownV2(nlpResult.clarification_message || "Sorry, I didn't understand that. Can you please rephrase?"));
    }

  } catch (error) {
    console.error("Error in message handler:", error);
    // Generic fallback error, escape it
    await ctx.replyWithMarkdownV2(escapeMarkdownV2('Sorry, an internal error occurred while processing your message.'));
  }
};

// Export
module.exports = {
  handler: [shouldRespond, requireLink, messageHandler],
}; 