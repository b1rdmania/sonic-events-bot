// DEVELOPMENT PHILOSOPHY: Prioritize refining prompts over hardcoding logic.
// Aim for natural language interaction by leveraging LLM understanding.
// See BOT_CAPABILITIES.md for more details.

// Remove previous debug logging and commented out import
const config = require('../../config');
const { escapeMarkdownV2 } = require('../services/escapeUtil');
const fs = require('fs'); // Need fs to read capabilities file
const path = require('path'); // Need path for resolving file path

// --- Singleton Pattern for Gemini Instance ---
let GoogleGenAIClass = null; // Keep class reference if needed elsewhere, though maybe not
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

// --- Read Capabilities ---
let botCapabilities = "Bot capabilities not loaded.";
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

/**
 * Analyzes user input using Gemini to generate a direct natural language response
 * ONLY IF the answer is likely answerable from the provided context.
 * @param {string} text - User's natural language query.
 * @param {object} context - Additional context (e.g., { events: [...] }).
 * @returns {Promise<string>} - A promise resolving to the generated natural language response string, or an error message string.
 */
async function generateDirectAnswerFromContext(text, context = {}) {
    // Renamed from processNaturalLanguageQuery
    // Implementation remains largely the same as the original processNaturalLanguageQuery
    // It focuses on directly answering based on context.
    try {
        // 1. Get the singleton Gemini instance
        const genAI = await getGeminiInstance();
        if (!genAI) {
            throw new Error('Failed to retrieve Gemini AI instance.');
        }

        // Initialize safety settings lazily
        if (!safetySettings) {
            const { HarmCategory, HarmBlockThreshold } = await import('@google/genai');
            safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ];
        }

        // 2. Get model ID
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

        // 3. Build the event context string
        const availableEvents = context.events || [];
        const eventContextString = availableEvents.length > 0
            ? `Here is the list of relevant Luma events:\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\\n')}`
            : "There is no specific event context available right now.";
        // console.log("DirectAnswer: Built eventContextString:", eventContextString); // Optional: Add specific prefix

        // 4. Create the simplified prompt for direct answers
        const simplifiedPrompt = `You are a helpful and efficient AI assistant managing Luma events, acting like a secretary for the user. Respond in a natural, conversational, and concise manner based *only* on the provided context.\nIf the user's request can be answered directly using the context below, provide the answer clearly and politely.\nIf the user asks for an action (like approving a guest) but provides incomplete information (e.g., missing the guest email), ask a clarifying question to get the missing details.\nIf the context doesn't contain the answer, or if the user asks for something you know you can't do (like managing bot users), politely state that you don't have that information or capability.\n\n${eventContextString}\n\nUser Request: \"${text}\"\n\nAnswer:`;
        // console.log("DirectAnswer: Full prompt being sent to Gemini:", simplifiedPrompt); // Optional: Add specific prefix

        // 5. Generate content
        // console.log(`DirectAnswer: Using model ${modelId}. Calling generateContent...`); // Optional: Add specific prefix
        const result = await genAI.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: simplifiedPrompt }] }],
            safetySettings: safetySettings,
        });

        // 6. Process the TEXT response (same as before)
        const candidates = result?.candidates;
        const responseText = candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            console.error('DirectAnswer: No valid text part found in Gemini response:', JSON.stringify(result, null, 2));
            const promptFeedback = result?.promptFeedback;
            if (promptFeedback?.blockReason) {
                console.error("DirectAnswer: Prompt blocked:", promptFeedback.blockReason);
                return `Sorry, your request was blocked due to safety settings (${promptFeedback.blockReason}).`;
            }
            if (candidates && candidates.length > 0 && candidates[0].finishReason && candidates[0].finishReason !== 'STOP') {
                console.error("DirectAnswer: Candidate finished with reason:", candidates[0].finishReason);
                return `Sorry, the response generation stopped unexpectedly (${candidates[0].finishReason}).`;
            }
            return "Sorry, I received an empty or invalid response from the AI.";
        }

        // console.log("DirectAnswer: Generated Response:", responseText); // Optional: Add specific prefix
        return responseText.trim();

    } catch (error) {
        console.error(`Error in generateDirectAnswerFromContext: ${error.message}\\nStack: ${error.stack}`);
        return `Sorry, I encountered an error processing your request: ${error.message}`;
    }
}

/**
 * Determines if a user query requires calling a specific Luma API function (tool)
 * or if it can be answered directly from context.
 * Returns either the structured tool call info or indicates a direct answer is needed.
 * @param {string} text - User's natural language query.
 * @param {object} context - Additional context (e.g., { events: [...] }).
 * @returns {Promise<{ action: 'TOOL_CALL' | 'DIRECT_ANSWER', tool?: string, params?: object, message?: string }>}
 */
async function determineAction(text, context = {}) {
    try {
        // 1. Get Gemini Instance
        const genAI = await getGeminiInstance();
        if (!genAI) throw new Error('Failed to retrieve Gemini AI instance for action determination.');

        // Initialize safety settings if needed
        if (!safetySettings) {
            const { HarmCategory, HarmBlockThreshold } = await import('@google/genai');
            safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ];
        }

        // 2. Model ID
        const modelId = config.gemini.modelId || "gemini-2.0-flash";

        // 3. Build Context String (same as direct answer function)
        const availableEvents = context.events || [];
        const eventContextString = availableEvents.length > 0
            ? `Relevant Luma Events Context:\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\\n')}`
            : "No specific event context available.";

        // 4. Define Available Tools (simplified description for the prompt)
        const toolsDescription = `
You have access to the following Luma functions (tools) to get information OR take actions:

1.  **getEvent(event_id)**: Gets *all* details for a *single* specific event. Use this if the user asks for details beyond name/date/id provided in the context.
2.  **getGuests(event_id, [status_filter])**: Lists guests for a specific event. Optional 'status_filter' can be 'approved' or 'pending_approval'. Use this for requests about *who* is attending or their status.
3.  **updateGuestStatus(event_id, guest_email, new_status)**: Updates a specific guest's status. Requires the event ID and the guest's email. 'new_status' must be either 'approved' or 'declined'.
        `.trim();

        // 5. Construct the Action Determination Prompt
        const actionPrompt = `
You are an assistant helping manage Luma events. Analyze the User Request below, considering the provided Context and your Capabilities/Limitations.

**Context:**
${eventContextString}

**Your Capabilities & Limitations:**
${botCapabilities}

**Available Tools:**
${toolsDescription}

**User Request:** "${text}"

**Your Task:**
Decide the best course of action:
1.  **TOOL_CALL:** If the user asks for information or to perform an action *only* available via one of the tools AND you can reliably extract all necessary parameters (like event_id, guest_email), respond with ONLY a JSON object specifying the tool and parameters.
    *   Example formats:
        \`\`\`json
        {"action": "TOOL_CALL", "tool": "getGuests", "params": {"event_id": "evt-..."}}
        \`\`\`
        \`\`\`json
        {"action": "TOOL_CALL", "tool": "getGuests", "params": {"event_id": "evt-...", "status_filter": "pending_approval"}}
        \`\`\`
        \`\`\`json
        {"action": "TOOL_CALL", "tool": "getEvent", "params": {"event_id": "evt-..."}}
        \`\`\`
        \`\`\`json
        {"action": "TOOL_CALL", "tool": "updateGuestStatus", "params": {"event_id": "evt-...", "guest_email": "user@example.com", "new_status": "approved"}}
        \`\`\`
        \`\`\`json
        {"action": "TOOL_CALL", "tool": "updateGuestStatus", "params": {"event_id": "evt-...", "guest_email": "user@example.com", "new_status": "declined"}}
        \`\`\`
    *   Ensure \`event_id\` exists in the context. Resolve ambiguous event references if possible. If ambiguous or not found, use DIRECT_ANSWER.
2.  **DIRECT_ANSWER:** Respond with ONLY \`{\"action\": \"DIRECT_ANSWER\"}\` IF:
    *   The request can be answered sufficiently using *only* the provided Context.
    *   The request falls under your Limitations (like asking to authorize users).
    *   The request requires clarification (e.g., ambiguous event reference, missing required parameter like **guest_email** for updateGuestStatus).
    *   The intent is unclear or the request is outside your capabilities.

**IMPORTANT:** Respond with ONLY the JSON object. If you choose DIRECT_ANSWER because clarification is needed (like a missing email), the separate direct answer generation step will handle asking the user for the missing information based on the context.
        `;

        // 6. Call Gemini
        console.log("DetermineAction: Calling Gemini to decide action...");
        // console.log("DetermineAction: Prompt:", actionPrompt); // DEBUG: Log prompt if needed
        const result = await genAI.models.generateContent({
            model: modelId,
            contents: [{ role: "user", parts: [{ text: actionPrompt }] }],
            safetySettings: safetySettings,
            // Force JSON output if model supports it and we can configure it here?
            // For now, we rely on prompt instructions and parse the text response.
        });

        // 7. Parse the Response
        const candidates = result?.candidates;
        let responseText = candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        // *** ADD RAW RESPONSE LOGGING HERE ***
        console.log("DetermineAction: Raw Gemini response text:", responseText); // Log before cleaning/parsing
        if (!responseText) {
            console.error('DetermineAction: No text response from Gemini for action determination:', JSON.stringify(result, null, 2));
            return { action: 'DIRECT_ANSWER', message: 'Error determining action, attempting direct answer.' };
        }

        // Clean potential markdown ```json ... ```
        responseText = responseText.replace(/^```json\s*|```$/g, '').trim();

        try {
            const decision = JSON.parse(responseText);
            if (decision.action === 'TOOL_CALL' && decision.tool && decision.params) {
                console.log("DetermineAction: Decided TOOL_CALL:", decision);
                return decision; // Contains action, tool, params
            } else if (decision.action === 'DIRECT_ANSWER') {
                console.log("DetermineAction: Decided DIRECT_ANSWER");
                return { action: 'DIRECT_ANSWER' };
            } else {
                console.error("DetermineAction: Invalid JSON structure received:", responseText);
                return { action: 'DIRECT_ANSWER', message: 'Received invalid decision structure, attempting direct answer.' };
            }
        } catch (parseError) {
            // Log the raw text again in case of parse error
            console.error("DetermineAction: Failed to parse Gemini JSON response:", parseError, "Raw response after cleaning:", responseText);
            return { action: 'DIRECT_ANSWER', message: 'Failed to parse decision, attempting direct answer.' };
        }

    } catch (error) {
        console.error(`Error in determineAction: ${error.message}\\nStack: ${error.stack}`);
        // Fallback to direct answer on error
        return { action: 'DIRECT_ANSWER', message: `Error determining action: ${error.message}` };
    }
}

/**
 * Takes raw data and instructions, asks Gemini to format it for the user.
 * @param {object|array} data - The raw data to be formatted (e.g., list of events, guests).
 * @param {string} userQueryContext - Context for the formatting request.
 * @returns {Promise<string>} - Gemini's formatted text response.
 * @throws {Error} - If the API call fails or returns an unexpected response.
 */
async function formatDataWithGemini(data, userQueryContext = "the user's request") {
  try {
    // 1. Get the singleton Gemini instance
    const genAI = await getGeminiInstance();
    if (!genAI) {
      throw new Error('Failed to retrieve Gemini AI instance (formatter).');
    }

    // Initialize safety settings lazily
    if (!safetySettings) {
        const { HarmCategory, HarmBlockThreshold } = await import('@google/genai');
        safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];
    }

    // 2. Get the specific model using the instance -- No, call generateContent directly
    const modelId = config.gemini.modelId || "gemini-2.0-flash";
    // console.log(`Using model: ${modelId} for formatting. Getting model via genAI.models.getGenerativeModel...`);
    // const model = genAI.models.getGenerativeModel({ // This method does not exist on models object
    //     model: modelId,
    //     safetySettings: safetySettings
    // });
    // console.log('Successfully got generative model for formatting.');

    // 3. Build the prompt
    const prompt = `
You are an AI assistant acting as a helpful secretary. Your task is to take the raw JSON data below and present it as a natural, conversational response suitable for Telegram. The user asked about: \"${userQueryContext}\"

**Formatting Guidelines for Telegram:**
- **Tone:** Friendly, efficient, and conversational, like a helpful secretary providing information.
- **Conciseness:** Be clear and to the point. Avoid unnecessary filler.
- **Markdown:** Use MarkdownV2 *very sparingly*. 
    - ONLY use it if essential for clarity (e.g., making \`[links](url)\` clickable, perhaps using \`code format\` for emails or IDs if it helps distinguish them).
    - **Avoid excessive bolding (\`**...**\`) or italics (\`_..._\`).** Prioritize a clean, natural text appearance.
    - Ensure any Markdown used is correctly escaped for Telegram.
- **Lists (Events/Guests):**
    - **State the total count *first* in a natural sentence (e.g., \"Okay, I found 30 guests on the pending list for Dubai:\").**
    - Use simple bullet points (e.g., \`*\`).
    - Present each item clearly and naturally. For guests, ensure **name** and **email** are included, along with other relevant details like company, presented conversationally within the bullet point.
- **Other Details:**
    - Mention if there are more results (\`has_more: true\`) naturally.
    - State clearly and politely if data is empty.
    - Format dates/times naturally.

**Raw Data:**
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

**Formatted Response (Natural, Conversational, Minimal Markdown):**
`;

    // 4. Generate content using genAI.models.generateContent directly
    console.log(`Using model ${modelId}. Calling genAI.models.generateContent for formatting...`);
    const result = await genAI.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: safetySettings,
    });

    // 5. Process result
    const candidates = result?.candidates;

    // --- Simpler check using optional chaining --- 
    const responseText = candidates?.[0]?.content?.parts?.[0]?.text;

    // Check if responseText is missing or empty after optional chaining
    if (!responseText) {
        console.error("Invalid response structure (no text) from Gemini formatting model (checked via optional chaining):", JSON.stringify(result, null, 2));
        const promptFeedback = result?.promptFeedback; // Check directly on result
        if (promptFeedback?.blockReason) {
            console.error("Formatting prompt blocked:", promptFeedback.blockReason);
            return escapeMarkdownV2(`I couldn\'t format the response due to safety settings: ${promptFeedback.blockReason}`);
        }
        if (candidates && candidates.length > 0 && candidates[0].finishReason && candidates[0].finishReason !== 'STOP') {
           console.error("Formatting candidate finished with reason:", candidates[0].finishReason);
           return escapeMarkdownV2(`Sorry, I encountered an issue while formatting the data (${candidates[0].finishReason}).`);
        }
        // Generic error if text is still missing
        return escapeMarkdownV2("Sorry, I couldn\'t format the data properly (missing text).");
    }
    // --- End Simpler Check --- 

    // Process the valid text (KEEP EXISTING CLEANING LOGIC FOR FORMATTER IF NEEDED, though likely not needed here)
    const formattedText = responseText; // Assume formatter doesn't wrap in ```json
    return formattedText;

  } catch (error) {
    console.error(`Error in formatDataWithGemini: ${error.message}\nStack: ${error.stack}`);
    return escapeMarkdownV2(`Sorry, an error occurred while trying to format the response: ${error.message}. Raw data: ${JSON.stringify(data)}`);
  }
}

module.exports = {
  generateDirectAnswerFromContext, // Renamed function
  determineAction, // New function for deciding action
  formatDataWithGemini
}; 