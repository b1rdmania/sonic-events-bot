const lumaClient = require('../luma/client');
const { escapeMarkdownV2 } = require('./escapeUtil');

/**
 * Fetches and formats a list of events for an organization using MarkdownV2.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {object} [options] - Optional filtering/pagination options for the API call.
 * @returns {Promise<string>} - A formatted string listing the events or a message indicating none were found.
 * @throws {Error} - If the API call fails.
 */
async function listOrgEvents(encryptedApiKey, options = {}) {
  console.log("Attempting to list events via Luma API..."); // Log entry
  let result;
  try {
    result = await lumaClient.listEvents(encryptedApiKey, options);
    console.log(`Luma API Result (listEvents):`, JSON.stringify(result, null, 2)); // Log Luma Result
  } catch (lumaError) {
    console.error("Error calling lumaClient.listEvents:", lumaError);
    throw new Error(`Failed to fetch events from Luma API: ${lumaError.message}`); // Re-throw specific error
  }

  if (!result || !result.entries || result.entries.length === 0) {
    // Return plain text, escape at the end
    return escapeMarkdownV2('No upcoming events found for the linked Luma account.');
  }

  // Build reply with raw text first
  let rawReply = `Found ${result.entries.length} event(s):\n\n`;
  result.entries.forEach((event, index) => {
    const startTime = event.start_at ? new Date(event.start_at).toLocaleString() : 'N/A';
    const eventName = event.name || 'Unnamed Event';
    const eventId = event.api_id;
    // const escapedStartTime = escapeMarkdownV2(startTime); // Remove escaping here

    // Use raw values, format with markdown characters
    rawReply += `${index + 1}. *${eventName}* (ID: \`${eventId}\`)\n`; // Raw dot, parens, backticks, star
    rawReply += `   Starts: ${startTime}\n`;
  });

  if (result.has_more) {
    const noteContent = "More events available - pagination not yet implemented";
    // Add raw note with italics marker
    rawReply += `\n_${noteContent}_`;
  }

  // Escape the entire built string at the end
  return escapeMarkdownV2(rawReply);
}

module.exports = {
  listOrgEvents,
}; 