const axios = require('axios');
const config = require('../../config'); // Adjust path as needed
const { decrypt } = require('../../lib/crypto');

const LUMA_API_BASE_URL = 'https://api.lu.ma/public/v1';

/**
 * Creates an Axios instance configured for Luma API calls.
 * @param {string} encryptedApiKey - The encrypted Luma API key for the organization.
 * @returns {import('axios').AxiosInstance}
 */
const createLumaApiClient = (encryptedApiKey) => {
  let apiKey;
  try {
    apiKey = decrypt(encryptedApiKey); // Decrypt the key before use
  } catch (error) {
    console.error("Failed to decrypt Luma API key:", error);
    throw new Error('Invalid Luma API key configuration for organization.');
  }

  if (!apiKey) {
    throw new Error('Decrypted Luma API key is missing.');
  }

  return axios.create({
    baseURL: LUMA_API_BASE_URL,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-luma-api-key': apiKey,
    },
    timeout: 15000, // 15 second timeout
  });
};

/**
 * Handles Luma API errors, logging and potentially re-throwing.
 * @param {Error} error - The error object from Axios or Luma.
 * @param {string} context - Description of the operation being attempted.
 */
const handleApiError = (error, context) => {
  if (axios.isAxiosError(error)) {
    console.error(
      `Luma API Error (${context}): ${error.response?.status} ${error.response?.statusText}`,
      {
        url: error.config?.url,
        data: error.response?.data,
      }
    );
    // Potentially throw a more specific error based on status code
    if (error.response?.status === 401) {
      throw new Error(`Luma API Authentication Failed (${context}). Check API Key.`);
    }
    if (error.response?.status === 404) {
      throw new Error(`Luma API Not Found (${context}). Check IDs.`);
    }
    // Add more specific error handling as needed
    throw new Error(`Luma API request failed (${context}): ${error.message}`);
  } else {
    console.error(`Error during Luma API call (${context}):`, error);
    throw error; // Re-throw unexpected errors
  }
};

// --- API Functions will go here --- 

/**
 * Validates a Luma API key by fetching the user's own info.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @returns {Promise<object>} - The user data from Luma API (or throws error).
 */
async function getSelf(encryptedApiKey) {
  const apiClient = createLumaApiClient(encryptedApiKey);
  const context = 'getSelf';
  try {
    const response = await apiClient.get('/user/get-self');
    console.info(`Luma API Success (${context})`);
    return response.data; // Assuming response.data contains the user info
  } catch (error) {
    handleApiError(error, context);
  }
}

/**
 * Lists events managed by the calendar associated with the API key.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {object} [options] - Optional query parameters.
 * @param {string} [options.after] - ISO 8601 datetime string. List events starting after this time.
 * @param {string} [options.before] - ISO 8601 datetime string. List events ending before this time.
 * @param {string} [options.pagination_cursor] - Cursor for pagination.
 * @param {number} [options.pagination_limit] - Limit number of results.
 * @returns {Promise<object>} - The list of events and pagination info from Luma.
 */
async function listEvents(encryptedApiKey, options = {}) {
  const apiClient = createLumaApiClient(encryptedApiKey);
  const context = 'listEvents';
  try {
    // Filter out undefined options
    const params = Object.entries(options).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const response = await apiClient.get('/calendar/list-events', { params });
    console.info(`Luma API Success (${context}) - Found ${response.data?.entries?.length || 0} events`);
    return response.data; // Expecting { entries: [...], has_more: bool, next_cursor: str }
  } catch (error) {
    handleApiError(error, context);
  }
}

/**
 * Gets the list of guests for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {object} [options] - Optional query parameters.
 * @param {string} [options.approval_status] - Filter by approval status (e.g., 'approved', 'pending_approval').
 * @param {string} [options.pagination_cursor] - Cursor for pagination.
 * @param {number} [options.pagination_limit] - Limit number of results.
 * @returns {Promise<object>} - The list of guests and pagination info from Luma.
 */
async function getGuests(encryptedApiKey, eventApiId, options = {}) {
  const apiClient = createLumaApiClient(encryptedApiKey);
  const context = 'getGuests';
  try {
    // Combine mandatory event_api_id with optional filters
    const params = { event_api_id: eventApiId };
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        params[key] = value;
      }
    });

    const response = await apiClient.get('/event/get-guests', { params });
    console.info(`Luma API Success (${context}) - Found ${response.data?.entries?.length || 0} guests for event ${eventApiId}`);
    return response.data; // Expecting { entries: [...], has_more: bool, next_cursor: str }
  } catch (error) {
    handleApiError(error, context);
  }
}

/**
 * Updates the status of a guest for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event.
 * @param {string} guestEmail - The email address of the guest to update.
 * @param {'approved' | 'declined'} newStatus - The new status for the guest.
 * @param {boolean} [shouldRefund=false] - Whether to refund if declining a paid guest.
 * @returns {Promise<object>} - The response data from Luma API (e.g., success message or updated guest).
 */
async function updateGuestStatus(encryptedApiKey, eventApiId, guestEmail, newStatus, shouldRefund = false) {
  const apiClient = createLumaApiClient(encryptedApiKey);
  const context = 'updateGuestStatus';
  try {
    const requestBody = {
      guest: {
        type: 'email',
        email: guestEmail,
      },
      event_api_id: eventApiId,
      status: newStatus,
      should_refund: shouldRefund,
    };

    const response = await apiClient.post('/event/update-guest-status', requestBody);
    console.info(`Luma API Success (${context}) - Updated status for ${guestEmail} in event ${eventApiId} to ${newStatus}`);
    return response.data;
  } catch (error) {
    // Log the specific details for debugging update errors
    console.error(`Failed ${context} details:`, { eventApiId, guestEmail, newStatus });
    handleApiError(error, context);
  }
}

/**
 * Gets details for a specific event.
 * @param {string} encryptedApiKey - The encrypted Luma API key.
 * @param {string} eventApiId - The API ID of the event to fetch.
 * @returns {Promise<object>} - The event details from Luma API.
 */
async function getEvent(encryptedApiKey, eventApiId) {
  const apiClient = createLumaApiClient(encryptedApiKey);
  const context = 'getEvent';
  try {
    const params = { api_id: eventApiId }; // Luma API uses 'api_id' for this endpoint
    const response = await apiClient.get('/event/get', { params });
    console.info(`Luma API Success (${context}) - Fetched details for event ${eventApiId}`);
    return response.data?.event; // Assuming the event data is nested under 'event'
  } catch (error) {
    handleApiError(error, context);
  }
}

module.exports = {
  createLumaApiClient,
  handleApiError,
  getSelf,
  listEvents,
  getGuests,
  getEvent,
  updateGuestStatus,
  // Export other API functions once defined
}; 