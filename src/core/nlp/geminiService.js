// DEVELOPMENT PHILOSOPHY: Simplify Code, Trust Gemini, Post-Process.\n// Primary logic in resolveQuery, formatData minimal, postProcess cleans up.\n// See BOT_CAPABILITIES.md for more details.\n\n// --- Eager Initialization Approach ---
console.log('--- Loading geminiService.js ---');
const config = require('../../config/config.js'); // Require at top level
const { escapeMarkdownV2 } = require('../services/escapeUtil');
const fs = require('fs');
const path = require('path');

let genAIInstance = null;       // Module scope instance
let safetySettings = null;      // Module scope safety settings
let initializationPromise = null; // Promise to track initialization

/**
 * Initializes the Gemini client and safety settings eagerly on module load.
 */
async function initializeGeminiAndSafetySettings() {
    console.log('[Init] Attempting to initialize Gemini client and safety settings...');
    if (genAIInstance) {
        console.log('[Init] Gemini already initialized.');
        return; // Already done or in progress via the promise
    }

    // Validate config existence early
    if (!config || typeof config !== 'object') {
        console.error('[Init] *** FATAL: Config object not available during initialization!', typeof config);
        throw new Error('Config object not available during initialization.');
    }
    if (!config.gemini || !config.gemini.apiKey) {
         console.error('[Init] *** FATAL: Gemini API Key missing in config during initialization!', config.gemini);
         throw new Error('Missing GEMINI_API_KEY during initialization.');
    }

    try {
        console.log('[Init] Dynamically importing @google/genai...');
        // Import the entire module object
        const genaiModule = await import('@google/genai');
        console.log('[Init] @google/genai imported successfully.');

        // Access exports DIRECTLY from the module object
        const GoogleGenerativeAI = genaiModule.GoogleGenerativeAI;
        const HarmCategory = genaiModule.HarmCategory;
        const HarmBlockThreshold = genaiModule.HarmBlockThreshold;

        // Validate Class and Enums
        if (!GoogleGenerativeAI || typeof GoogleGenerativeAI !== 'function') {
             console.error('[Init] GoogleGenerativeAI class not found or not a function after import.', GoogleGenerativeAI);
             throw new Error(`GoogleGenerativeAI class not found or invalid type (${typeof GoogleGenerativeAI})`);
        }
        if (!HarmCategory || !HarmBlockThreshold) {
            console.error('[Init] HarmCategory or HarmBlockThreshold not found after import.', { HarmCategory, HarmBlockThreshold });
            throw new Error('HarmCategory or HarmBlockThreshold not found in imported module');
        }
        console.log('[Init] GoogleGenerativeAI class and enums validated.');

        // Instantiate Client
        console.log('[Init] Instantiating GoogleGenerativeAI...');
        // Assign to module-level variable
        genAIInstance = new GoogleGenerativeAI({
            apiKey: config.gemini.apiKey,
        });
        console.log('[Init] GoogleGenerativeAI instantiated successfully.');

        // Initialize Safety Settings
        console.log('[Init] Initializing safety settings...');
        // Assign to module-level variable
        safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];
        console.log('[Init] Safety settings initialized.');

        console.log('[Init] Gemini client and safety settings initialized successfully.');

    } catch (error) {
        console.error('[Init] ****** Failed to initialize Gemini client or safety settings: ******', error);
        genAIInstance = null; // Ensure instance is null on failure
        safetySettings = null;
        throw error; // Propagate error to reject the initializationPromise
    }
}

// Immediately invoke the initialization function and store the promise
initializationPromise = initializeGeminiAndSafetySettings().catch(err => {
    console.error("[Init] ****** CATCH BLOCK: Gemini Initialization FAILED ******", err.message);
    // Ensure the promise remains rejected
    initializationPromise = Promise.reject(err);
    // Application WILL NOT WORK without Gemini, maybe exit? Or let requests fail.
    // process.exit(1); // Optionally force exit
    return Promise.reject(err); // Make sure caller sees rejection
});

// --- End Eager Initialization ---


// --- Read Capabilities ---
let botCapabilities = "Error loading capabilities...";
try {
    // Corrected path to go up 3 levels to the root
    const capabilitiesPath = path.join(__dirname, '..', '..', '..', 'BOT_CAPABILITIES.md');
    botCapabilities = fs.readFileSync(capabilitiesPath, 'utf8');
    // Extract relevant sections for the prompt (optional, but cleaner)
    const capabilitiesMatch = botCapabilities.match(/## Current Capabilities \\(Using Luma API\\)(.*?)(##|$)/s);
    const limitationsMatch = botCapabilities.match(/## Limitations - What the Bot CANNOT Do(.*?)(##|$)/s);
    // Use template literals for easier string formatting
    botCapabilities = `
Available Actions (Tools):
${capabilitiesMatch ? capabilitiesMatch[1].trim() : 'Refer to BOT_CAPABILITIES.md'}

Limitations (What you CANNOT do):
${limitationsMatch ? limitationsMatch[1].trim() : 'Refer to BOT_CAPABILITIES.md'}
    `.trim();
    console.log("Successfully loaded and parsed bot capabilities for prompts.");
} catch (err) {
    console.error("Error loading BOT_CAPABILITIES.md:", err);
    botCapabilities = "Error loading capabilities. Essential functions: List Events, Get Event Details, List Guests. Limitations: Cannot manage users or settings.";
}
// --- End Read Capabilities ---

/**
 * Primary function to resolve user query.
 * Uses the eagerly initialized Gemini instance.
 */
async function resolveQuery(text, context = {}) {
    try {
        // Wait for initialization to complete (or fail)
        await initializationPromise;
        // Check if initialization succeeded
        if (!genAIInstance) {
            console.error("resolveQuery: Gemini AI instance not available after initialization attempt.");
            throw new Error('Gemini AI service is not initialized.'); // Throw specific error
        }

        const modelId = config.gemini.modelId || "gemini-2.0-flash"; // Use top-level config

        // Build Context String
        const availableEvents = context.events || [];
        const eventContextString = availableEvents.length > 0
            ? `Relevant Luma Events Context:\\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\\n')}`
            : "No specific event context available.";

        // Define Available Tools
        const toolsDescription = `
You have access to the following Luma functions (tools) to get information OR take actions:
1. getEvent(event_id): Gets ALL details for a SINGLE specific event.
2. getGuests(event_id, [status_filter]): Lists guests for an event. Optional 'status_filter': 'approved', 'pending_approval'.
3. updateGuestStatus(event_id, guest_email, new_status): Updates guest status. 'new_status': 'approved' or 'declined'. Requires guest_email.
        `.trim();

        // Construct the Main Prompt
        const mainPrompt = `
You are an AI assistant acting as a helpful secretary managing Luma events.
Analyze the User Request considering the Context, your Capabilities, and available Tools.

**Context:**
${eventContextString}

**Your Capabilities & Limitations:**
${botCapabilities}

**Available Tools:**
${toolsDescription}

**User Request:** "${text}"

**Your Task:** Decide the *best* course of action.
1.  **If fulfilling the request REQUIRES using one of the tools** (because the info isn't in the context or an action is needed) AND you can reliably extract all necessary parameters (event_id, guest_email etc.):
    Respond with ONLY the JSON object specifying the tool call. Examples:
    \`\`\`json
    {"action": "TOOL_CALL", "tool": "getGuests", "params": {"event_id": "evt-...", "status_filter": "pending_approval"}}
    \`\`\`
    \`\`\`json
    {"action": "TOOL_CALL", "tool": "updateGuestStatus", "params": {"event_id": "evt-...", "guest_email": "user@example.com", "new_status": "approved"}}
    \`\`\`
    *   Resolve ambiguous event names to IDs from context if possible.
2.  **Otherwise (if the request can be answered from context, is a limitation, needs clarification like a missing email, or is unclear):**
    Respond DIRECTLY with the final, natural language answer, written in a helpful, conversational secretary tone suitable for Telegram. Use minimal Markdown (only for essential function like links). DO NOT output JSON in this case. Examples:
    *   "Okay, the Dubai event (evt-...) is scheduled for May 1st, 2025."
    *   "I can approve guests, but I'll need the email address for the guest you want to approve for the Dubai event."
    *   "Sorry, I cannot manage bot access or authorize new users."

**Response:** (Either JSON for TOOL_CALL or Natural Language Text for DIRECT_ANSWER)
        `;

        console.log("ResolveQuery: Calling Gemini...");
        // Use the module-level instance and safety settings
        const result = await genAIInstance.getGenerativeModel({ model: modelId, safetySettings }).generateContent(mainPrompt);
        const response = result.response; // Access response directly in v1? Check docs/examples
        let responseText = response?.text(); // Use text() method if available

        if (!responseText) {
            responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); // Fallback if text() not available/empty
        }

        if (!responseText) {
            console.error('ResolveQuery: No text response from Gemini.', JSON.stringify(response, null, 2));
            throw new Error("No response text received from Gemini."); // Throw specific error
        }

        console.log("ResolveQuery: Raw Gemini response:", responseText);

        // Clean markdown fences FIRST, then check/parse
        const cleanedJson = responseText.replace(/^```(?:json)?\\s*|\\s*```$/g, '').trim();
        if (cleanedJson.startsWith('{') && cleanedJson.endsWith('}')) {
            try {
                const decision = JSON.parse(cleanedJson);
                if (decision.action === 'TOOL_CALL' && decision.tool && decision.params) {
                    console.log("ResolveQuery: Decided TOOL_CALL:", decision);
                    return decision; // Return the JSON object
                } else {
                     // Looks like JSON but not a valid TOOL_CALL structure
                     console.warn("ResolveQuery: Parsed JSON but not a valid TOOL_CALL structure:", decision);
                     // Fall through to treat as direct answer
                }
            } catch (e) {
                console.warn("ResolveQuery: Response looked like JSON but failed to parse. Treating as direct answer.", e);
                // Fall through to return responseText as direct answer
            }
        }

        // If it wasn't valid JSON or didn't parse as TOOL_CALL, assume it's a direct answer
        console.log("ResolveQuery: Treating response as DIRECT_ANSWER text.");
        return responseText; // Return the plain text

  } catch (error) {
        console.error(`Error in resolveQuery: ${error.message}\\nStack: ${error.stack}`);
        // Check if error is from initialization promise
        if (error.message.includes('initialization') || error.message.includes('Gemini AI service is not initialized')) {
             return `Sorry, the AI service failed to start or is unavailable. Please notify the administrator.`;
        }
        // Return a generic error message for other issues
        return `Sorry, an error occurred while processing your query. Please try again.`;
    }
}

/**
 * Formats raw data (typically from Luma API) into a basic structure.
 * Uses the eagerly initialized Gemini instance.
 */
async function formatDataWithGemini(data, userQueryContext = "the user's request") {
    try {
        // Wait for initialization to complete (or fail)
        await initializationPromise;
        // Check if initialization succeeded
        if (!genAIInstance) {
            console.error("formatDataWithGemini: Gemini AI instance not available after initialization attempt.");
            throw new Error('Gemini AI service is not initialized.'); // Throw specific error
        }

        const modelId = config.gemini.modelId || "gemini-2.0-flash"; // Use top-level config

        // Simplified prompt: Focus on structure, not tone/markdown
        const formatPrompt = `
Format the following JSON data based on the user's request about "${userQueryContext}".
- If it's a list of guests, state the total count first, then list each guest with name and email using simple bullet points.
- If it's event details, list the key information.
- If data is empty, state that clearly.
- Mention if data has 'has_more: true'.

Raw Data:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Formatted Output:
`;

        console.log("FormatData: Calling Gemini...");
        // Use the module-level instance and safety settings
        const result = await genAIInstance.getGenerativeModel({ model: modelId, safetySettings }).generateContent(formatPrompt);
        const response = result.response;
        let formattedText = response?.text(); // Use text() method if available

        if (!formattedText) {
             formattedText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); // Fallback
        }

        if (!formattedText) {
            console.warn("FormatData: No formatted text received. Returning raw data string.", JSON.stringify(response, null, 2));
            return `Data received but could not be formatted: ${JSON.stringify(data)}`; // Fallback
        }
        return formattedText;
    } catch (error) {
        console.error(`Error in formatDataWithGemini: ${error.message}\\nStack: ${error.stack}`);
         if (error.message.includes('initialization') || error.message.includes('Gemini AI service is not initialized')) {
             return `Error formatting data: AI service unavailable.`;
        }
        return `Error formatting data: ${error.message}. Raw data: ${JSON.stringify(data)}`;
    }
}

/**
 * Post-processes a response string for tone and formatting.
 * Uses the eagerly initialized Gemini instance.
 */
async function postProcessResponse(inputText) {
    if (!inputText || typeof inputText !== 'string') {
        console.warn("PostProcess: Received invalid input, skipping.");
        return inputText; // Return input as is if invalid
    }

    try {
        // Wait for initialization to complete (or fail)
        await initializationPromise;
        // Check if initialization succeeded
        if (!genAIInstance) {
            console.error("postProcessResponse: Gemini AI instance not available after initialization attempt.");
            throw new Error('Gemini AI service is not initialized.'); // Throw specific error
        }

        const modelId = config.gemini.modelId || "gemini-2.0-flash"; // Use top-level config

        const postProcessPrompt = `
Review the following text, which is an AI assistant's draft response for Telegram. Your task is to refine it into clean, natural language suitable for a helpful secretary communicating via chat.

**Refinement Guidelines:**
- **Tone:** Ensure the tone is friendly, efficient, and conversational.
- **Markdown:** Remove any unnecessary Markdown formatting (like excessive bolding \`**...**\`, italics \`_..._\`, or code formatting \`\`...\`\` that isn't essential for clarity).
- **Keep Essential Markdown:** Retain Markdown ONLY if it serves a clear purpose, such as making URLs clickable (e.g., \`[Link Text](URL)\`).
- **Natural Language:** Rephrase any awkward or overly structured sentences to sound more natural.
- **Conciseness:** Keep the response clear and concise.

**Draft Text:**
---
${inputText}
---

**Refined Text (Natural Language for Telegram):**
`;

        console.log("PostProcess: Calling Gemini for cleanup...");
         // Use the module-level instance and safety settings
        const result = await genAIInstance.getGenerativeModel({ model: modelId, safetySettings }).generateContent(postProcessPrompt);
        const response = result.response;
        let refinedText = response?.text(); // Use text() method if available

        if (!refinedText) {
             refinedText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); // Fallback
        }

        if (!refinedText) {
            console.warn("PostProcess: No refined text received from Gemini. Returning original text.", JSON.stringify(response, null, 2));
            return inputText; // Fallback to original text
        }

        console.log("PostProcess: Cleanup successful.");
        return refinedText;

  } catch (error) {
        console.error(`Error in postProcessResponse: ${error.message}\\nStack: ${error.stack}`);
         if (error.message.includes('initialization') || error.message.includes('Gemini AI service is not initialized')) {
            console.warn("PostProcess: Cleanup skipped, AI service unavailable.");
            return inputText; // Return original text if AI unavailable
        }
        // Fallback to original text on other errors during cleanup
        console.warn("PostProcess: Error during cleanup, returning original text.");
        return inputText;
  }
}

// Remove getGeminiInstance and initializeSafetySettingsIfNeeded functions

module.exports = {
  resolveQuery,       // New primary function
  formatDataWithGemini, // Kept for formatting tool results
  postProcessResponse, // Kept for final cleanup
  initializationPromise // Expose promise for potential checks elsewhere? Maybe not needed.
}; 