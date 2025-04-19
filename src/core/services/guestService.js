const lumaClient = require('../luma/client');
const prisma = require('../db/prisma'); // Need prisma for audit logging
const { escapeMarkdownV2 } = require('./escapeUtil'); // Import from new util file

/**
 * Fetches and formats a list of guests for a specific event using MarkdownV2.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {object} [options] - Optional filtering/pagination options for the API call.
 * @returns {Promise<string>} - A formatted string listing the guests or a message indicating none were found.
 * @throws {Error} - If the API call fails.
 */
async function getEventGuests(encryptedApiKey, eventApiId, options = {}) {
  const result = await lumaClient.getGuests(encryptedApiKey, eventApiId, options);
  console.log(`Luma API Result (getGuests for ${eventApiId}):`, JSON.stringify(result, null, 2)); // Log Luma Result

  const statusFilter = options.approval_status;
  const escapedEventId = escapeMarkdownV2(eventApiId);
  const escapedStatusFilter = escapeMarkdownV2(statusFilter);

  if (!result || !result.entries || result.entries.length === 0) {
    return `No guests found for event \`${escapedEventId}\`` + (statusFilter ? ` with status \"${escapedStatusFilter}\"` : '\.');
  }

  let reply = `Found ${result.entries.length} guests for event \`${escapedEventId}\``;
  if (statusFilter) {
      reply += ` with status \"${escapedStatusFilter}\"`
  }
  reply += ':\n';

  result.entries.forEach((guest, index) => {
    const guestName = escapeMarkdownV2(guest.name || 'N/A');
    const guestEmail = escapeMarkdownV2(guest.email || 'N/A');
    const guestStatus = escapeMarkdownV2(guest.approval_status || 'N/A');
    reply += `${index + 1}\\. ${guestName} \(${guestEmail}\) \- Status: ${guestStatus}\n`;
  });

  if (result.has_more) {
      reply += `\n_\(More guests available \- pagination not yet implemented\)_`;
  }

  return reply;
}

/**
 * Fetches guests for an event and returns counts by approval status using MarkdownV2.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {object} [options] - Optional filtering options.
 * @returns {Promise<string>} - A formatted string summarizing guest counts.
 * @throws {Error} - If the API call fails.
 */
async function getEventGuestCount(encryptedApiKey, eventApiId, options = {}) {
  const result = await lumaClient.getGuests(encryptedApiKey, eventApiId, options);
  console.log(`Luma API Result (getGuests for count for ${eventApiId}):`, JSON.stringify(result, null, 2)); // Log Luma Result

  const escapedEventId = escapeMarkdownV2(eventApiId);

  if (!result || !result.entries) {
    return `Could not retrieve guest information for event \`${escapedEventId}\`\.`;
  }

  const guests = result.entries;
  const totalGuests = guests.length;

  if (totalGuests === 0) {
    return `No guests found for event \`${escapedEventId}\`` + (options.approval_status ? ` with status \"${escapeMarkdownV2(options.approval_status)}\"` : '\.');
  }

  const statusCounts = guests.reduce((counts, guest) => {
    const status = guest.approval_status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  let reply = `*Guest Summary for event \`${escapedEventId}\`*:\nTotal Guests: ${totalGuests}\n`;
  for (const [status, count] of Object.entries(statusCounts)) {
    reply += `- ${escapeMarkdownV2(status)}: ${count}\n`;
  }

  if (result.has_more) {
    const noteContent = "Note: Counts based on the first batch of guests retrieved. More guests exist.";
    reply += `\n_${escapeMarkdownV2(noteContent)}_`;
  }

  return reply;
}

/**
 * Approves a guest for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {string} guestEmail - The email address of the guest to approve.
 * @param {object} [auditContext={}] - Context for audit logging ({ orgId, userId, groupId }).
 * @returns {Promise<string>} - A success message using MarkdownV2.
 * @throws {Error} - If the API call or audit logging fails.
 */
async function approveGuest(encryptedApiKey, eventApiId, guestEmail, auditContext = {}) {
  try {
    // Call the Luma client function
    await lumaClient.updateGuestStatus(encryptedApiKey, eventApiId, guestEmail, 'approved');

    // Log success to audit log
    await prisma.auditLog.create({
      data: {
        orgId: auditContext.orgId || 'UNKNOWN', // Should have orgId from context
        userId: auditContext.userId ? BigInt(auditContext.userId) : null,
        groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
        actionType: 'approve_guest',
        details: { success: true, eventApiId, guestEmail }
      }
    });

    return `Successfully approved \`${escapeMarkdownV2(guestEmail)}\` for event \`${escapeMarkdownV2(eventApiId)}\`\.`;

  } catch (error) {
    console.error(`Error in approveGuest service for event ${eventApiId}, guest ${guestEmail}:`, error);
    // Log failure to audit log
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
    // Re-throw the original error to be handled by the caller
    throw new Error(`Failed to approve guest \`${escapeMarkdownV2(guestEmail)}\`\. Error: ${escapeMarkdownV2(error.message)}`);
  }
}

/**
 * Rejects a guest for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {string} guestEmail - The email address of the guest to reject.
 * @param {object} [auditContext={}] - Context for audit logging ({ orgId, userId, groupId }).
 * @returns {Promise<string>} - A success message using MarkdownV2.
 * @throws {Error} - If the API call or audit logging fails.
 */
async function rejectGuest(encryptedApiKey, eventApiId, guestEmail, auditContext = {}) {
  try {
    // Call the Luma client function with 'declined' status
    // TODO: Handle should_refund? Maybe add as optional param?
    await lumaClient.updateGuestStatus(encryptedApiKey, eventApiId, guestEmail, 'declined');

    // Log success to audit log
    await prisma.auditLog.create({
      data: {
        orgId: auditContext.orgId || 'UNKNOWN',
        userId: auditContext.userId ? BigInt(auditContext.userId) : null,
        groupId: auditContext.groupId ? BigInt(auditContext.groupId) : null,
        actionType: 'reject_guest',
        details: { success: true, eventApiId, guestEmail }
      }
    });

    return `Successfully rejected \`${escapeMarkdownV2(guestEmail)}\` for event \`${escapeMarkdownV2(eventApiId)}\`\.`;

  } catch (error) {
    console.error(`Error in rejectGuest service for event ${eventApiId}, guest ${guestEmail}:`, error);
    // Log failure to audit log
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
    // Re-throw the original error to be handled by the caller
    throw new Error(`Failed to reject guest \`${escapeMarkdownV2(guestEmail)}\`\. Error: ${escapeMarkdownV2(error.message)}`);
  }
}

module.exports = {
  getEventGuests,
  getEventGuestCount,
  approveGuest,
  rejectGuest,
}; 