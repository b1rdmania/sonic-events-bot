# Sonic World Events Bot - Capabilities and Limitations

This document outlines the features and boundaries of the Sonic World Events Telegram Bot.

## Core Purpose

The bot acts as an assistant for managing and retrieving information about Luma events associated with your configured API key. It uses Google Gemini for natural language understanding and response generation, and interacts with the Luma API for specific data retrieval and actions.

## Current Capabilities (Using Luma API)

The bot can currently perform the following actions based on your natural language requests:

1.  **List Upcoming Events:** Provide a summary of upcoming events, including their Name, Luma Event ID, and Start Time. (Uses Luma API: `listEvents` + `getEvent`)
2.  **Get Specific Event Details:** Retrieve and display detailed information about a single event when asked about it by name or ID. (Uses Luma API: `getEvent`)
3.  **List Guests for an Event:** Fetch and display a list of registered guests for a specific event. You can often filter by status (e.g., "approved guests", "pending guests"). Includes guest count. (Uses Luma API: `getGuests`)
4.  **Approve Guest:** Change a guest's status to 'approved' for a specific event. You typically need to provide the guest's email address. (Uses Luma API: `updateGuestStatus`)
5.  **Decline Guest:** Change a guest's status to 'declined' for a specific event. You typically need to provide the guest's email address. (Uses Luma API: `updateGuestStatus`)
6.  **Format Information:** Present data retrieved from the Luma API (like event lists or guest lists) in a user-friendly, readable format using Markdown, specifically optimized for display within **Telegram**.

## Potential Future Capabilities

*   **Get Guest Count:** Provide the total number of registered guests for an event. (Based on `getGuests` data)

## Limitations - What the Bot CANNOT Do

The bot's actions are strictly limited to the functions available in the Luma API and the logic implemented in the bot's code. It **cannot**:

*   **Manage Bot Access/Users:** Authorize or de-authorize users to interact with the bot itself. User access control is managed outside the bot's Luma-focused functions.
*   **Modify Core Event Settings:** Change event names, dates, descriptions, locations, ticket prices, etc. (beyond guest status). Event creation and major modifications should be done directly in Luma.
*   **Access Information Not in Luma:** Retrieve data from other sources, calendars, or systems unless explicitly integrated.
*   **Perform Arbitrary Actions:** Execute commands or tasks outside the scope of Luma event/guest management as defined by its programmed capabilities.
*   **Manage Luma Account Settings:** Change API keys, billing information, or Luma account preferences.

## How it Works

1.  **User Query:** You send a message to the bot in Telegram.
2.  **Context Fetching:** The bot fetches a list of relevant Luma event IDs (`listEvents`) and then gets details for each (`getEvent`) to provide context.
3.  **Natural Language Understanding (Gemini):** Your query and the event context are sent to Google Gemini.
    *   Gemini determines if it can answer directly based on the context OR if a specific Luma API action (like fetching guests) is needed.
4.  **Luma API Interaction (If Needed):** If Gemini determines an action is needed (e.g., getting guests), the bot calls the corresponding function in the `lumaClient` (e.g., `lumaClient.getGuests`).
5.  **Response Generation/Formatting (Gemini):**
    *   If an action was taken, the raw data from Luma and the original query context are sent to Gemini (`formatDataWithGemini`) to create a formatted, natural language response.
    *   If no specific action was needed, Gemini generates a direct natural language answer based on the initial query and context (`generateDirectAnswerFromContext`).
6.  **Reply:** The bot sends the generated response back to you in Telegram.

## Example Interactions

*   "What events are happening next month?" -> Bot lists events using context.
*   "Tell me about the Dubai event." -> Bot uses context or calls `getEvent` for details.
*   "Who has registered for the Vienna Summit?" -> Bot identifies intent, calls `getGuests` for the Vienna event, formats the list.
*   "Can you add alice@example.com to the Prague event?" -> (Future capability) Bot identifies intent, calls `addGuests`.
*   "Can you authorize Bob to use this bot?" -> Bot responds it cannot manage user access, based on its limitations.

## Authorizing the Bot (Initial Setup)

To allow the bot to access your Luma data, the person setting up the bot needs to perform a one-time authorization:

1.  Start a **Direct Message (DM)** chat with the bot on Telegram.
2.  Use the command `/link`.
3.  The bot will ask for your Luma API Key.
4.  Paste your Luma API key directly into the DM chat.

The bot will then encrypt and securely store this key, associating it with your organization or chat. This process authorizes the **bot** to act on your behalf using your Luma account; it **does not** authorize other Telegram users to use the bot. Managing *which users* can talk to the bot is handled separately through Telegram group/bot settings, not through the bot's Luma functions.

---
*This document should be kept up-to-date as bot capabilities evolve.* 