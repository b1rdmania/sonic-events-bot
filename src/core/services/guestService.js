const lumaClient = require('../luma/client');
const prisma = require('../db/prisma'); // Need prisma for audit logging
// Remove unused escapeMarkdownV2 import if no longer needed elsewhere in file
// const { escapeMarkdownV2 } = require('./escapeUtil');

/**
 * Fetches a list of guests for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {object} [options] - Optional filtering/pagination options for the API call.
 * @returns {Promise<object>} - An object containing the list of guest entries and pagination info { entries: [], has_more: boolean, statusFilter: string|null } or null if no guests found.
 * @throws {Error} - If the API call fails.
 */
async function getEventGuests(encryptedApiKey, eventApiId, options = {}) {
  const result = await lumaClient.getGuests(encryptedApiKey, eventApiId, options);
  console.log(`Luma API Result (getGuests for ${eventApiId}):`, JSON.stringify(result, null, 2));

  const statusFilter = options.approval_status || null;

  if (!result || !result.entries || result.entries.length === 0) {
    return null; // Return null if no guests found
  }

  // Return raw data + context
  return {
    entries: result.entries,
    has_more: result.has_more,
    statusFilter: statusFilter // Include filter in response for context
  };

  // --- Removed formatting logic ---
  /*
  const escapedEventId = escapeMarkdownV2(eventApiId);
  const escapedStatusFilter = escapeMarkdownV2(statusFilter);
  let rawReply = `Found ${result.entries.length} guests for event \`${escapedEventId}\``;
  if (statusFilter) {
      rawReply += ` with status \"${escapedStatusFilter}\"`;
  }
  rawReply += ':\n';

  result.entries.forEach((guest, index) => {
    const guestName = guest.name || 'N/A';
    const guestEmail = guest.email || 'N/A';
    const guestStatus = guest.approval_status || 'N/A';
    rawReply += `${index + 1}. ${guestName} (${guestEmail}) - Status: ${guestStatus}\n`;
  });

  if (result.has_more) {
      const noteContent = "More guests available - pagination not yet implemented";
      rawReply += `\n_${noteContent}_`;
  }
  return escapeMarkdownV2(rawReply);
  */
}

/**
 * Fetches guests for an event and returns counts by approval status.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {object} [options] - Optional filtering options.
 * @returns {Promise<object>} - An object summarizing guest counts { totalGuests: number, counts: object, has_more: boolean, statusFilter: string|null } or null if no guests found.
 * @throws {Error} - If the API call fails.
 */
async function getEventGuestCount(encryptedApiKey, eventApiId, options = {}) {
  const result = await lumaClient.getGuests(encryptedApiKey, eventApiId, options);
  console.log(`Luma API Result (getGuests for count for ${eventApiId}):`, JSON.stringify(result, null, 2));

  const statusFilter = options.approval_status || null;

  if (!result || !result.entries) {
      // Indicate failure to retrieve rather than zero guests
      throw new Error(`Could not retrieve guest information for event ${eventApiId}.`);
  }

  const guests = result.entries;
  const totalGuests = guests.length;

  if (totalGuests === 0) {
      return null; // Return null if no guests found
  }

  const statusCounts = guests.reduce((counts, guest) => {
    const status = guest.approval_status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  // Return raw counts object
  return {
      totalGuests: totalGuests,
      counts: statusCounts,
      has_more: result.has_more,
      statusFilter: statusFilter
  };

  // --- Removed formatting logic ---
  /*
  let rawReply = `*Guest Summary for event \`${eventApiId}\`*:\nTotal Guests: ${totalGuests}\n`;
  for (const [status, count] of Object.entries(statusCounts)) {
    rawReply += `- ${status}: ${count}\n`;
  }

  if (result.has_more) {
    const noteContent = "Note: Counts based on the first batch of guests retrieved. More guests exist.";
    rawReply += `\n_${noteContent}_`;
  }
  return escapeMarkdownV2(rawReply);
  */
}

/**
 * Approves a guest for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {string} guestEmail - The email address of the guest to approve.
 * @param {object} [auditContext={}] - Context for audit logging ({ orgId, userId, groupId }).
 * @returns {Promise<string>} - A simple success message (unformatted).
 * @throws {Error} - If the API call or audit logging fails (unformatted error message).
 */
async function approveGuest(encryptedApiKey, eventApiId, guestEmail, auditContext = {}) {
  try {
    await lumaClient.updateGuestStatus(encryptedApiKey, eventApiId, guestEmail, 'approved');
    await prisma.auditLog.create({
      data: {
        orgId: auditContext.orgId || 'UNKNOWN',
        userId: auditContext.userId ? BigInt(auditContext.userId) : null,
        groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
        actionType: 'approve_guest',
        details: { success: true, eventApiId, guestEmail }
      }
    });
    // Return simple, unformatted success message
    return `Successfully approved ${guestEmail} for event ${eventApiId}.`;

  } catch (error) {
    console.error(`Error in approveGuest service for event ${eventApiId}, guest ${guestEmail}:`, error);
    try {
      await prisma.auditLog.create({
        data: {
          orgId: auditContext.orgId || 'UNKNOWN',
          userId: auditContext.userId ? BigInt(auditContext.userId) : null,
          groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
          actionType: 'approve_guest_failed',
          details: { success: false, eventApiId, guestEmail, error: error.message }
        }
      });
    } catch (logError) {
      console.error("Failed to create failure audit log for approveGuest service:", logError);
    }
    // Re-throw simple, unformatted error message
    throw new Error(`Failed to approve guest ${guestEmail}. Error: ${error.message}`);
  }
}

/**
 * Rejects a guest for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {string} guestEmail - The email address of the guest to reject.
 * @param {object} [auditContext={}] - Context for audit logging ({ orgId, userId, groupId }).
 * @returns {Promise<string>} - A simple success message (unformatted).
 * @throws {Error} - If the API call or audit logging fails (unformatted error message).
 */
async function rejectGuest(encryptedApiKey, eventApiId, guestEmail, auditContext = {}) {
  try {
    await lumaClient.updateGuestStatus(encryptedApiKey, eventApiId, guestEmail, 'declined');
    await prisma.auditLog.create({
      data: {
        orgId: auditContext.orgId || 'UNKNOWN',
        userId: auditContext.userId ? BigInt(auditContext.userId) : null,
        groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
        actionType: 'reject_guest',
        details: { success: true, eventApiId, guestEmail }
      }
    });
    // Return simple, unformatted success message
    return `Successfully rejected ${guestEmail} for event ${eventApiId}.`;

  } catch (error) {
    console.error(`Error in rejectGuest service for event ${eventApiId}, guest ${guestEmail}:`, error);
    try {
      await prisma.auditLog.create({
        data: {
          orgId: auditContext.orgId || 'UNKNOWN',
          userId: auditContext.userId ? BigInt(auditContext.userId) : null,
          groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
          actionType: 'reject_guest_failed',
          details: { success: false, eventApiId, guestEmail, error: error.message }
        }
      });
    } catch (logError) {
      console.error("Failed to create failure audit log for rejectGuest service:", logError);
    }
    // Re-throw simple, unformatted error message
    throw new Error(`Failed to reject guest ${guestEmail}. Error: ${error.message}`);
  }
}

module.exports = {
  getEventGuests,
  getEventGuestCount,
  approveGuest,
  rejectGuest,
}; 