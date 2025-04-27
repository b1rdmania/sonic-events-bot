const lumaClient = require('../luma/client');
// Remove unused escapeMarkdownV2 import if no longer needed elsewhere in file
// const { escapeMarkdownV2 } = require('./escapeUtil');

/**
 * Fetches a list of events for an organization.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {object} [options] - Optional filtering/pagination options for the API call.
 * @returns {Promise<object>} - An object containing the list of event entries and pagination info { entries: [], has_more: boolean } or null if no events found.
 * @throws {Error} - If the API call fails.
 */
async function listOrgEvents(encryptedApiKey, options = {}) {
  console.log("Attempting to list events via Luma API..."); // Log entry
  let result;
  try {
    result = await lumaClient.listEvents(encryptedApiKey, options);
    // Log only essential parts for brevity unless debugging deeper
    console.log(`Luma API Result (listEvents): Found ${result?.entries?.length || 0} events. Has More: ${result?.has_more}`);
  } catch (lumaError) {
    console.error("Error calling lumaClient.listEvents:", lumaError);
    // Throw the original error or a custom one
    throw new Error(`Failed to fetch events from Luma API: ${lumaError.message}`);
  }

  if (!result || !result.entries || result.entries.length === 0) {
    return null; // Return null instead of a formatted string
  }

  // Return the relevant data, not a formatted string
  return {
      entries: result.entries, // Return the raw entries
      has_more: result.has_more
  };

  // --- Removed formatting logic ---
  /*
  let rawReply = `Found ${result.entries.length} event(s):\\n\\n`;
  result.entries.forEach((event, index) => {
    const startTime = event.start_at ? new Date(event.start_at).toLocaleString() : 'N/A';
    const eventName = event.name || 'Unnamed Event';
    const eventId = event.api_id;

    rawReply += `${index + 1}. *${eventName}* (ID: \`${eventId}\`)\\n`;
    rawReply += `   Starts: ${startTime}\\n`;
  });

  if (result.has_more) {
    const noteContent = "More events available - pagination not yet implemented";
    rawReply += `\\n_${noteContent}_`;
  }
  return escapeMarkdownV2(rawReply);
  */
}

module.exports = {
  listOrgEvents,
}; 