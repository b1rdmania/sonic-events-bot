// DEVELOPMENT PHILOSOPHY: Simplify Code, Trust Gemini, Post-Process.
// Primary logic in resolveQuery, formatData minimal, postProcess cleans up.
// See BOT_CAPABILITIES.md for more details.

const config = require('../../config/config.js'); // Top-level require
const { escapeMarkdownV2 } = require('../services/escapeUtil');
const fs = require('fs');
const path = require('path');

// --- Lazy Loading Singleton Pattern using require() ---
let GoogleGenAIClass = null;
let genAIInstance = null;
let safetySettings = null;

function getGenAIInstanceAndSettings() {
  // Return cached instance if available
  if (genAIInstance) {
    // console.log('Returning cached genAI instance and settings');
    return { genAIInstance, safetySettings };
  }

  // Attempt to load using require()
  try {
    console.log('Attempting require("@google/genai")');
    const genaiModule = require('@google/genai');
    console.log('Successfully required @google/genai');

    // Check for constructor directly or under .default
    let GenAIConstructor = genaiModule?.GoogleGenerativeAI;
    if (!GenAIConstructor || typeof GenAIConstructor !== 'function') {
        console.log('GoogleGenerativeAI not found directly, checking default...');
        GenAIConstructor = genaiModule?.default?.GoogleGenerativeAI;
    }

    // Check for enums directly or under .default
    let HarmCategory = genaiModule?.HarmCategory;
    let HarmBlockThreshold = genaiModule?.HarmBlockThreshold;
    if (!HarmCategory || !HarmBlockThreshold) {
         console.log('Enums not found directly, checking default...');
         HarmCategory = genaiModule?.default?.HarmCategory;
         HarmBlockThreshold = genaiModule?.default?.HarmBlockThreshold;
    }

    // Validate constructor
    if (!GenAIConstructor || typeof GenAIConstructor !== 'function') {
        console.error('Failed to find GoogleGenerativeAI constructor via require() or require().default');
        throw new Error('GoogleGenerativeAI constructor not found');
    }
    // Validate enums
    if (!HarmCategory || !HarmBlockThreshold) {
        console.error('Failed to find HarmCategory/HarmBlockThreshold via require() or require().default');
        throw new Error('GoogleGenerativeAI safety enums not found');
    }

    console.log('GoogleGenerativeAI constructor and enums found.');
    GoogleGenAIClass = GenAIConstructor; // Store the found class

    // Initialize Safety Settings using found enums
    console.log('Initializing safety settings...');
    safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
    console.log('Safety settings initialized.');

    // Instantiate Client
    if (!config.gemini.apiKey) {
      throw new Error('Missing required environment variable: GEMINI_API_KEY cannot instantiate');
    }
    console.log('Instantiating and caching GoogleGenAI instance...');
    genAIInstance = new GoogleGenAIClass({
        apiKey: config.gemini.apiKey,
    });

    console.log('Gemini client instantiated and cached.');
    return { genAIInstance, safetySettings };

  } catch (error) {
    console.error('Failed during require() or initialization:', error);
    genAIInstance = null; // Reset on failure
    safetySettings = null;
    GoogleGenAIClass = null;
    // Throw a specific error or return null/undefined? Re-throwing for now.
    throw new Error(`Failed to get/initialize Gemini instance: ${error.message}`);
  }
}
// --- End Singleton Pattern ---


// --- Read Capabilities --- (Keep as is, uses fs sync)
let botCapabilities = "Error loading capabilities...";
try {
    const capabilitiesPath = path.join(__dirname, '..', '..', '..', 'BOT_CAPABILITIES.md');
    botCapabilities = fs.readFileSync(capabilitiesPath, 'utf8');
    // Use simpler regex without capturing groups if only trimming is needed
    const capabilitiesMatch = botCapabilities.match(/## Current Capabilities.*?\(Using Luma API\)(.*?)(?=## Limitations|\Z)/s);
    const limitationsMatch = botCapabilities.match(/## Limitations - What the Bot CANNOT Do(.*?)(?=##|$)/s);

    const extractedCapabilities = capabilitiesMatch ? capabilitiesMatch[2].trim() : 'Refer to BOT_CAPABILITIES.md';
    const extractedLimitations = limitationsMatch ? limitationsMatch[1].trim() : 'Refer to BOT_CAPABILITIES.md';

    botCapabilities = `
Available Actions (Tools):
${extractedCapabilities}

Limitations (What you CANNOT do):
${extractedLimitations}
    `.trim();
    console.log("Successfully loaded and parsed bot capabilities for prompts.");
} catch (err) {
    console.error("Error loading BOT_CAPABILITIES.md:", err);
    botCapabilities = "Error loading capabilities. Essential functions: List Events, Get Event Details, List Guests. Limitations: Cannot manage users or settings.";
}
// --- End Read Capabilities ---

/**
 * Primary function to resolve user query.
 * Uses the lazily initialized Gemini instance via require().
 */
async function resolveQuery(text, context = {}) {
    let client, settings;
    try {
        // Get instance and settings (initializes on first call)
        ({ genAIInstance: client, safetySettings: settings } = getGenAIInstanceAndSettings());

        const modelId = config.gemini.modelId || "gemini-2.0-flash"; // Use top-level config

        // Build Context String
        const availableEvents = context.events || [];
        const eventContextString = availableEvents.length > 0
            ? `Relevant Luma Events Context:\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\n')}`
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
        const result = await client.getGenerativeModel({ model: modelId, safetySettings: settings }).generateContent(mainPrompt);
        const response = result.response;
        let responseText = response?.text();

        if (!responseText) {
            responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        }

        if (!responseText) {
            console.error('ResolveQuery: No text response from Gemini.', JSON.stringify(response, null, 2));
            throw new Error("No response text received from Gemini.");
        }

        console.log("ResolveQuery: Raw Gemini response:", responseText);
        // Clean markdown fences FIRST, then check/parse
        const cleanedJson = responseText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        if (cleanedJson.startsWith('{') && cleanedJson.endsWith('}')) {
            try {
                const decision = JSON.parse(cleanedJson);
                if (decision.action === 'TOOL_CALL' && decision.tool && decision.params) {
                    console.log("ResolveQuery: Decided TOOL_CALL:", decision);
                    return decision; // Return the JSON object
                } else {
                     console.warn("ResolveQuery: Parsed JSON but not a valid TOOL_CALL structure:", decision);
                }
            } catch (e) {
                console.warn("ResolveQuery: Response looked like JSON but failed to parse. Treating as direct answer.", e);
            }
        }

        console.log("ResolveQuery: Treating response as DIRECT_ANSWER text.");
        return responseText;

  } catch (error) {
        console.error(`Error in resolveQuery: ${error.message}\nStack: ${error.stack}`);
        return `Sorry, an error occurred while processing your query. Please try again.`;
    }
}

/**
 * Formats raw data using the lazily initialized Gemini instance.
 */
async function formatDataWithGemini(data, userQueryContext = "the user's request") {
    let client, settings;
    try {
        ({ genAIInstance: client, safetySettings: settings } = getGenAIInstanceAndSettings());
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

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
        const result = await client.getGenerativeModel({ model: modelId, safetySettings: settings }).generateContent(formatPrompt);
        const response = result.response;
        let formattedText = response?.text();

        if (!formattedText) {
             formattedText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        }

        if (!formattedText) {
            console.warn("FormatData: No formatted text received. Returning raw data string.", JSON.stringify(response, null, 2));
            return `Data received but could not be formatted: ${JSON.stringify(data)}`;
        }
        return formattedText;
    } catch (error) {
        console.error(`Error in formatDataWithGemini: ${error.message}\nStack: ${error.stack}`);
        return `Error formatting data: ${error.message}. Raw data: ${JSON.stringify(data)}`;
    }
}

/**
 * Post-processes a response string using the lazily initialized Gemini instance.
 */
async function postProcessResponse(inputText) {
    if (!inputText || typeof inputText !== 'string') {
        console.warn("PostProcess: Received invalid input, skipping.");
        return inputText;
    }
    let client, settings;
    try {
        ({ genAIInstance: client, safetySettings: settings } = getGenAIInstanceAndSettings());
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

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
        const result = await client.getGenerativeModel({ model: modelId, safetySettings: settings }).generateContent(postProcessPrompt);
        const response = result.response;
        let refinedText = response?.text();

        if (!refinedText) {
             refinedText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        }

        if (!refinedText) {
            console.warn("PostProcess: No refined text received from Gemini. Returning original text.", JSON.stringify(response, null, 2));
            return inputText;
        }

        console.log("PostProcess: Cleanup successful.");
        return refinedText;

  } catch (error) {
        console.error(`Error in postProcessResponse: ${error.message}\nStack: ${error.stack}`);
        console.warn("PostProcess: Error during cleanup, returning original text.");
        return inputText;
  }
}

module.exports = {
  resolveQuery,
  formatDataWithGemini,
  postProcessResponse,
  // No longer exposing initializationPromise
}; 