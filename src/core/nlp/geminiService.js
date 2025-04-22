// DEVELOPMENT PHILOSOPHY: Simplify Code, Trust Gemini, Post-Process.\n// Primary logic in resolveQuery, formatData minimal, postProcess cleans up.\n// See BOT_CAPABILITIES.md for more details.\n\nconst config = require('../../config');
const { escapeMarkdownV2 } = require('../services/escapeUtil');
const fs = require('fs');
const path = require('path');

// --- Singleton Pattern --- (Keep getGeminiInstance unchanged)
let GoogleGenAIClass = null;
let genAIInstance = null;
async function getGeminiInstance() {
  // Return cached instance if available
  if (genAIInstance) {
    // console.log('Returning cached genAI instance');
    return genAIInstance;
  }

  // Load the class if not already loaded
  if (!GoogleGenAIClass) {
    try {
      console.log('Attempting dynamic import of @google/genai for class...');
      const mod = await import('@google/genai');
      // Use the correct class name identified from logs
      GoogleGenAIClass = mod.GoogleGenAI;
      if (!GoogleGenAIClass || typeof GoogleGenAIClass !== 'function') {
           console.error('GoogleGenAI class not found or not a function after import.', mod);
           throw new Error(`GoogleGenAI class not found or invalid type (${typeof GoogleGenAIClass}) in dynamically imported module.`);
      }
      console.log('GoogleGenAI class successfully loaded.');
    } catch (error) {
      console.error('Failed to dynamically import @google/genai:', error);
      GoogleGenAIClass = null; // Reset on failure
      throw error; // Propagate the error
    }
  }

  // Instantiate and cache the instance
  try {
    if (!config.gemini.apiKey) {
      throw new Error('Missing required environment variable: GEMINI_API_KEY cannot instantiate');
    }
    console.log('Instantiating and caching GoogleGenAI instance using { apiKey: ... }');
    genAIInstance = new GoogleGenAIClass({ 
        apiKey: config.gemini.apiKey,
        // apiEndpoint: 'generativelanguage.googleapis.com' // Keep endpoint if needed, but often optional
    });
    return genAIInstance;
  } catch (error) {
      console.error('Failed to instantiate GoogleGenAI:', error);
      genAIInstance = null; // Reset on failure
      throw error; // Propagate the error
  }
}
// --- End Singleton Pattern ---

// Define safety settings (can remain global, initialized lazily)
let safetySettings = null;
async function initializeSafetySettingsIfNeeded() {
    if (!safetySettings) {
        const { HarmCategory, HarmBlockThreshold } = await import('@google/genai');
        safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];
    }
}

// --- Read Capabilities ---
let botCapabilities = "Error loading capabilities...";
try {
    // Use path.join for cross-platform compatibility and correct path resolution
    const capabilitiesPath = path.join(__dirname, '..', '..', 'BOT_CAPABILITIES.md');
    botCapabilities = fs.readFileSync(capabilitiesPath, 'utf8');
    // Extract relevant sections for the prompt (optional, but cleaner)
    const capabilitiesMatch = botCapabilities.match(/## Current Capabilities \(Using Luma API\)(.*?)(##|$)/s);
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
    // Use a fallback or handle the error appropriately
    botCapabilities = "Error loading capabilities. Essential functions: List Events, Get Event Details, List Guests. Limitations: Cannot manage users or settings.";
}
// --- End Read Capabilities ---

/**\n * Primary function to resolve user query.\n * Determines if a tool call is needed or if a direct answer can be generated.\n * Outputs either JSON for a tool call OR the natural language direct answer.\n * @param {string} text - User's natural language query.\n * @param {object} context - Additional context (e.g., { events: [...] }).\n * @returns {Promise<object | string>} - JSON object for tool call OR string for direct answer.\n */
async function resolveQuery(text, context = {}) {
    try {
        const genAI = await getGeminiInstance();
        if (!genAI) throw new Error('Failed to retrieve Gemini AI instance.');
        await initializeSafetySettingsIfNeeded();
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

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
        const result = await genAI.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: mainPrompt }] }],
            safetySettings: safetySettings,
        });

        const candidates = result?.candidates;
        let responseText = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!responseText) {
            console.error('ResolveQuery: No text response from Gemini.', JSON.stringify(result, null, 2));
            return "Sorry, I encountered an issue processing your request."; // Default error text
        }

        console.log("ResolveQuery: Raw Gemini response:", responseText);

        // Check if the response LOOKS like JSON for a tool call
        if (responseText.startsWith('{') && responseText.endsWith('}')) {
            try {
                // Attempt to parse, clean markdown first just in case
                const cleanedJson = responseText.replace(/^```json\\s*|```$/g, '').trim();
                const decision = JSON.parse(cleanedJson);
                if (decision.action === 'TOOL_CALL' && decision.tool && decision.params) {
                    console.log("ResolveQuery: Decided TOOL_CALL:", decision);
                    return decision; // Return the JSON object
                }
            } catch (e) {
                // It looked like JSON but wasn't valid, treat as direct answer
                console.warn("ResolveQuery: Response looked like JSON but failed to parse. Treating as direct answer.", e);
                // Fall through to return responseText as direct answer
            }
        }

        // If it wasn't valid JSON or didn't parse, assume it's a direct answer
        console.log("ResolveQuery: Treating response as DIRECT_ANSWER text.");
        return responseText; // Return the plain text

    } catch (error) {
        console.error(`Error in resolveQuery: ${error.message}\nStack: ${error.stack}`);
        return `Sorry, an error occurred while processing your query: ${error.message}`;
    }
}

/**\n * Formats raw data (typically from Luma API) into a basic structure.\n * Minimal prompt, assuming post-processing will handle final tone/markdown.\n * @param {object|array} data - The raw data.\n * @param {string} userQueryContext - Context for the formatting request.\n * @returns {Promise<string>} - Basic formatted text.\n */
async function formatDataWithGemini(data, userQueryContext = "the user's request") {
    try {
        const genAI = await getGeminiInstance();
        if (!genAI) throw new Error('Failed to retrieve Gemini AI instance for formatting.');
        await initializeSafetySettingsIfNeeded();
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

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
        const result = await genAI.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: formatPrompt }] }],
            safetySettings: safetySettings,
        });
        const candidates = result?.candidates;
        const formattedText = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!formattedText) {
            console.warn("FormatData: No formatted text received. Returning raw data string.", JSON.stringify(result, null, 2));
            return `Data received but could not be formatted: ${JSON.stringify(data)}`; // Fallback
        }
        return formattedText;
    } catch (error) {
        console.error(`Error in formatDataWithGemini: ${error.message}\nStack: ${error.stack}`);
        return `Error formatting data: ${error.message}. Raw data: ${JSON.stringify(data)}`;
    }
}

// Keep postProcessResponse function as defined previously
async function postProcessResponse(inputText) {
    if (!inputText || typeof inputText !== 'string') {
        console.warn("PostProcess: Received invalid input, skipping.");
        return inputText; // Return input as is if invalid
    }

    try {
        const genAI = await getGeminiInstance();
        if (!genAI) throw new Error('Failed to retrieve Gemini AI instance for post-processing.');

        // Initialize safety settings if needed (can reuse the global let)
        if (!safetySettings) {
            const { HarmCategory, HarmBlockThreshold } = await import('@google/genai');
            safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ];
        }

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
        const result = await genAI.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: postProcessPrompt }] }],
            safetySettings: safetySettings,
        });

        const candidates = result?.candidates;
        const refinedText = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!refinedText) {
            console.warn("PostProcess: No refined text received from Gemini. Returning original text.", JSON.stringify(result, null, 2));
            return inputText; // Fallback to original text
        }

        console.log("PostProcess: Cleanup successful.");
        return refinedText;

    } catch (error) {
        console.error(`Error in postProcessResponse: ${error.message}\nStack: ${error.stack}`);
        // Fallback to original text on error
        console.warn("PostProcess: Error during cleanup, returning original text.");
        return inputText;
    }
}

module.exports = {
  resolveQuery,       // New primary function
  formatDataWithGemini, // Kept for formatting tool results
  postProcessResponse // Kept for final cleanup
}; 