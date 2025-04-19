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
 * Analyzes user input using Gemini to generate a natural language response based on Luma context.
 * @param {string} text - User's natural language query.
 * @param {object} context - Additional context (e.g., { events: [...] }).
 * @returns {Promise<string>} - A promise resolving to the generated natural language response string, or an error message string.
 */
async function processNaturalLanguageQuery(text, context = {}) {
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

    // 2. Get model ID (still needed for the API call)
    const modelId = config.gemini.modelId || "gemini-2.0-flash";

    // 3. Build the event context string (Keep this part)
    const availableEvents = context.events || [];
    const eventContextString = availableEvents.length > 0
      ? `Here is the list of relevant Luma events:\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\n')}`
      : "There is no specific event context available right now.";

    // 4. Create the NEW simplified prompt
    const simplifiedPrompt = `You are a helpful assistant managing Luma events.

${eventContextString}

Please answer the following user request naturally based on the provided context. If the context doesn't contain the answer, say you don't have that information.

User Request: "${text}"

Answer:`;

    // 5. Generate content (requesting TEXT response)
    console.log(`Using model ${modelId}. Calling genAI.models.generateContent for natural language response...`);
    const result = await genAI.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: simplifiedPrompt }] }],
        safetySettings: safetySettings,
        // NO generationConfig for responseMimeType: "application/json"
    });

    // 6. Process the TEXT response
    const candidates = result?.candidates;
    const responseText = candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        console.error('No valid text part found in Gemini response (natural language request):', JSON.stringify(result, null, 2));
        const promptFeedback = result?.promptFeedback;
        if (promptFeedback?.blockReason) {
          console.error("Prompt blocked:", promptFeedback.blockReason);
          return `Sorry, your request was blocked due to safety settings (${promptFeedback.blockReason}).`;
        }
        if (candidates && candidates.length > 0 && candidates[0].finishReason && candidates[0].finishReason !== 'STOP') {
          console.error("Candidate finished with reason:", candidates[0].finishReason);
          return `Sorry, the response generation stopped unexpectedly (${candidates[0].finishReason}).`;
        }
        // Generic error if text is still missing
        return "Sorry, I received an empty or invalid response from the AI.";
      }
      
      // Return the generated text directly
      console.log("Generated Natural Language Response:", responseText);
      return responseText.trim(); // Trim whitespace

  } catch (error) {
    console.error(`Error in processNaturalLanguageQuery: ${error.message}\nStack: ${error.stack}`);
    return `Sorry, I encountered an error processing your request: ${error.message}`;
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
  processNaturalLanguageQuery,
  formatDataWithGemini
}; 