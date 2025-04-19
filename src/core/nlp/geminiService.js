// Remove previous debug logging and commented out import
const config = require('../../config');
const { escapeMarkdownV2 } = require('../services/escapeUtil');

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
// Define possible intents (can remain global)
const possibleIntents = [
  'GET_EVENTS', // List events
  'GET_GUESTS', // List guests for an event
  'GET_GUEST_COUNT', // Get the count of guests for an event
  'APPROVE_GUEST', // Approve a guest for an event
  'DECLINE_GUEST', // Decline a guest for an event
  'GET_EVENT_DETAILS', // Get specific details about an event
  'REQUIRES_CLARIFICATION', // When the request is ambiguous or needs more info
  'UNKNOWN' // When the intent cannot be determined
];

// Define example JSON outputs (can remain global)
const exampleOutput1 = JSON.stringify({ intent: "GET_GUESTS", entities: { event_id: "[RESOLVED_ID_OF_NEXT_EVENT_FROM_CONTEXT]", status_filter: "approved" }, requires_clarification: false });
const exampleOutput2 = JSON.stringify({ intent: "GET_EVENT_DETAILS", entities: { event_id: "evt-abc" }, requires_clarification: false });
const exampleOutput3 = JSON.stringify({ intent: "GET_GUESTS", entities: { event_id: "evt-pL3FEVQfjNqlBBJ", status_filter: "pending_approval" }, requires_clarification: false });
const exampleOutput4 = JSON.stringify({ intent: "GET_EVENT_DETAILS", entities: { event_id: "evt-12345" }, requires_clarification: false });
const exampleOutput5 = JSON.stringify({ intent: "REQUIRES_CLARIFICATION", entities: { guest_email: "test@test.com" }, requires_clarification: true, clarification_prompt: "Which Dubai event are you referring to? Please provide the Event ID or a more specific name from the list." });

/**
 * Analyzes user input using Gemini to determine intent and extract entities.
 * @param {string} text - User's natural language query.
 * @param {object} context - Additional context (e.g., { events: [{api_id: 'xyz', name: 'Event Foo', start_at: '...'}, ...] }).
 * @returns {Promise<object>} - A promise resolving to an object with intent, entities, or error/clarification.
 */
async function processNaturalLanguageQuery(text, context = {}) {
  try {
    // 1. Get the singleton Gemini instance
    const genAI = await getGeminiInstance();
    if (!genAI) { // Should not happen if getGeminiInstance throws on failure, but good practice
      throw new Error('Failed to retrieve Gemini AI instance.');
    }

    // Initialize safety settings lazily
    if (!safetySettings) {
        // Import HarmCategory/HarmBlockThreshold only once if needed
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
    // console.log(`Using model: ${modelId}. Getting model via genAI.models.getGenerativeModel...`);
    // const model = genAI.models.getGenerativeModel({ // This method does not exist on models object
    //     model: modelId,
    //     safetySettings: safetySettings,
    //     generationConfig: { responseMimeType: "application/json" }
    // });
    // console.log('Successfully got generative model.');

    // 3. Build the prompt
    const availableEvents = context.events || [];
    const eventContextString = availableEvents.length > 0
      ? `\\n\\nAvailable Events Context (Name, ID, Start Time):\\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\\n')}`
      : "\\n\\nNo specific event context available.";
    const outputFormatSection = `\n\n**Output Format:**
Return ONLY a JSON object with the following structure:
{
  "intent": "...", // One of the possible intents: ${possibleIntents.join(', ')}
  "entities": {
    "event_id": "...", // (Optional) RESOLVED Luma Event API ID (e.g., evt-xxxxxxxx)
    "guest_email": "...", // (Optional) Guest's email address
    "status_filter": "...", // (Optional) Filter for guests (VALID values: approved, pending_approval, declined, invited)
    "detail_requested": "..." // (Optional) Specific detail asked about an event (e.g., name, start_time, end_time, location, description, url, cover_url)
  },
  "requires_clarification": boolean, // True if more info is needed from the user
  "clarification_prompt": "..." // (Optional) A question to ask the user if requires_clarification is true
}`; // End backtick for this section
    const rulesSection = `\n\n**Intent Determination & Event Resolution Rules:**

1.  **Analyze Request:** Determine the core intent (e.g., GET_GUESTS, GET_EVENT_DETAILS).
2.  **Identify Event Reference:** Look for an event_id directly in the request OR an event_name OR a relative term like "next event", "latest event", "first event".
3.  **Resolve Event ID using Context:**
    *   If an event_id (evt-...) is present in the request, use that.
    *   If an event_name is mentioned, find the *best match* in the Available Events Context. If one clear match exists, use its api_id.
    *   If a relative term like "next event" is used, identify the event from the context with the closest upcoming start_at time (relative to now, assume current date is around April 2025). Use its api_id.
    *   If the name is ambiguous (multiple matches) or no match is found, set intent to REQUIRES_CLARIFICATION and explain in clarification_prompt.
    *   If the intent requires an event ID but none could be resolved, set intent to REQUIRES_CLARIFICATION.
    *   **Crucially, the goal is to populate the \`entities.event_id\` field in the JSON output based on your resolution.**
4.  **Handle Standalone Event ID:** If the user provides *only* an event ID (e.g., "evt-xyz123"), set intent to GET_EVENT_DETAILS and populate \`entities.event_id\`.
5.  **Status Filter:** For GET_GUESTS/GET_GUEST_COUNT, map terms like 'pending' to 'pending_approval'. Use 'approved' as default if unspecified. Valid values: 'approved', 'pending_approval', 'declined', 'invited'. Clarify if ambiguous.
6.  **Detail Requested:** For GET_EVENT_DETAILS, extract the specific detail asked for (name, start_time, location, etc.). Map natural language (when->start_time, where->location). If only an ID or general request was made, leave \`detail_requested\` null/empty.`; // End backtick for this section
    const examplesSection = `\n\n**Examples (using context above if relevant):**

*   User: "who is coming to the next event?"
    *   Output: ${exampleOutput1}
*   User: "details for the AI Workshop"
    *   Output: ${exampleOutput2} (Assuming evt-abc is AI Workshop in context)
*   User: "show pending for evt-pL3FEVQfjNqlBBJ"
    *   Output: ${exampleOutput3}
*   User: "evt-12345"
    *   Output: ${exampleOutput4}
*   User: "approve test@test.com for the dubai event"
    *   Output: ${exampleOutput5} (If multiple Dubai events in context)`; // End backtick for this section
    const finalInstruction = `\n\nAnalyze the user message based on the rules and context. Output only the JSON object.`;
    const prompt = `You are an AI assistant integrated with Luma (lu.ma) event management via its API.
Your task is to analyze user messages and determine the user's intent and extract relevant entities for API calls, using the provided context.`;
    const userRequestSection = `\n\nUser Request: "${text}"`;
    const contextSection = eventContextString;
    const fullPrompt = `${prompt}${userRequestSection}${contextSection}${outputFormatSection}${rulesSection}${examplesSection}${finalInstruction}`;

    // 4. Generate content using genAI.models.generateContent directly
    console.log(`Using model ${modelId}. Calling genAI.models.generateContent...`);
    // const result = await model.generateContent(fullPrompt); // Old call on separate model object
    const result = await genAI.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        safetySettings: safetySettings,
        generationConfig: { responseMimeType: "application/json" },
    });

    // 5. Process result (keep existing logic)
    const response = result.response;
    const candidates = response?.candidates;
    if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0 || !candidates[0].content.parts[0].text) {
        console.error('No valid text part found in Gemini response candidates:', JSON.stringify(result, null, 2));
        const promptFeedback = response?.promptFeedback;
        if (promptFeedback?.blockReason) {
          console.error("Prompt blocked:", promptFeedback.blockReason);
           return {
              intent: 'BLOCKED',
              entities: {},
              originalText: text,
              error: `Request blocked due to safety settings: ${promptFeedback.blockReason}`
          };
        }
        if (candidates && candidates.length > 0 && candidates[0].finishReason && candidates[0].finishReason !== 'STOP') {
          console.error("Candidate finished with reason:", candidates[0].finishReason);
           return {
              intent: 'UNKNOWN',
              entities: {},
              originalText: text,
              error: `AI response generation stopped unexpectedly (${candidates[0].finishReason}).`,
              rawResponse: JSON.stringify(result, null, 2)
            };
        }
        return {
          intent: 'UNKNOWN',
          entities: {},
          originalText: text,
          error: 'Received an empty or invalid response structure from AI model.',
          rawResponse: JSON.stringify(result, null, 2)
        };
      }
      const responseText = candidates[0].content.parts[0].text;
  
      // console.log("Raw Gemini Response Text (pre-cleaning):", responseText); // Can comment out
  
      // Attempt to parse the JSON response
      let parsedResponse;
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json') && cleanedText.endsWith('```')) {
          cleanedText = cleanedText.substring(7, cleanedText.length - 3).trim();
      }
      try {
        parsedResponse = JSON.parse(cleanedText);
      } catch (parseError) {
          console.error("Failed to parse Gemini JSON response:", parseError);
          console.error("Raw text that failed parsing (after cleaning):", cleanedText);
           return {
              intent: 'UNKNOWN',
              entities: {},
              originalText: text,
              error: 'Failed to parse response from AI model.',
              rawResponse: responseText
          };
      }
  
      console.log("Parsed Gemini Response:", parsedResponse);
      parsedResponse.originalText = text;
      return parsedResponse;

  } catch (error) {
    console.error(`Error in processNaturalLanguageQuery: ${error.message}\nStack: ${error.stack}`);
    return {
      intent: 'UNKNOWN',
      entities: {},
      originalText: text,
      error: `Processing failed: ${error.message}`
    };
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
You are an AI assistant helping format API data into a user-friendly, concise, and readable response for Telegram.
The user asked about: "${userQueryContext}"
The raw data obtained from the Luma API is below (JSON format).

Format this data into a natural language response.
- Use MarkdownV2 for formatting (e.g., *bold*, _italic_, \`code\`, [links](url)). Remember to escape characters like '.', '-', '(', ')' with a preceding backslash where necessary.
- Be concise. Avoid conversational filler unless the data is empty.
- If listing items (events, guests), use bullet points or numbered lists.
- If showing event details, highlight key information like name, date/time, and location (if available).
- If data contains \`has_more: true\`, mention that there are more results not shown.
- If data is empty or null, state that clearly (e.g., "No events found.", "No guests match that criteria.", "Couldn't find details for that event ID.").
- Make URLs clickable using MarkdownV2 link format. Escape URL characters if needed.
- Format dates/times clearly (e.g., "May 20, 2024 at 10:00 AM PDT"). Assume times are in the event's timezone unless specified otherwise.

Raw Data:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Formatted Response:
`;

    // 4. Generate content using genAI.models.generateContent directly
    console.log(`Using model ${modelId}. Calling genAI.models.generateContent for formatting...`);
    // const result = await model.generateContent(prompt); // Old call on separate model object
    const result = await genAI.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: safetySettings,
    });

    // 5. Process result (keep existing logic)
    const response = result.response;
    if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0 || !response.candidates[0].content.parts[0].text) {
        const promptFeedback = response?.promptFeedback;
        if (promptFeedback?.blockReason) {
            console.error("Formatting prompt blocked:", promptFeedback.blockReason);
            return escapeMarkdownV2(`I couldn\'t format the response due to safety settings: ${promptFeedback.blockReason}`);
        }
        if (response?.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
           console.error("Formatting candidate finished with reason:", response.candidates[0].finishReason);
           return escapeMarkdownV2(`Sorry, I encountered an issue while formatting the data (${response.candidates[0].finishReason}).`);
        }
        console.error("Invalid response structure from Gemini formatting model:", JSON.stringify(response, null, 2));
        return escapeMarkdownV2("Sorry, I couldn\'t format the data properly.");
    }
    const formattedText = response.candidates[0].content.parts[0].text;
    return formattedText;

  } catch (error) {
    console.error(`Error in formatDataWithGemini: ${error.message}\nStack: ${error.stack}`);
    return escapeMarkdownV2(`Sorry, an error occurred while trying to format the response: ${error.message}. Raw data: ${JSON.stringify(data)}`);
  }
}

module.exports = {
  processNaturalLanguageQuery,
  formatDataWithGemini
}; 