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
  const result = await lumaClient.listEvents(encryptedApiKey, options);

  if (!result || !result.entries || result.entries.length === 0) {
    return 'No upcoming events found for the linked Luma account\.'; // Escaped period
  }

  let reply = `Found ${result.entries.length} event\(s\):\n\n`;
  result.entries.forEach((event, index) => {
    const startTime = event.start_at ? new Date(event.start_at).toLocaleString() : 'N/A';
    const eventName = escapeMarkdownV2(event.name || 'Unnamed Event');
    const eventId = escapeMarkdownV2(event.api_id);
    const escapedStartTime = escapeMarkdownV2(startTime);

    reply += `${index + 1}\. *${eventName}* \(ID: \`${eventId}\`\)\n`;
    reply += `   Starts: ${escapedStartTime}\n`;
  });

  if (result.has_more) {
    reply += `\n_\(More events available \- pagination not yet implemented\)_`;
  }

  return reply;
}

module.exports = {
  listOrgEvents,
}; 