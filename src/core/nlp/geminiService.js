const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const config = require('../../config');
const { escapeMarkdownV2 } = require('../services/escapeUtil');

if (!config.gemini.apiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI({ apiKey: config.gemini.apiKey });

// Define safety settings (structure might be the same, constants imported from new package)
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Gemini model configuration
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro-latest", // Use the desired model name
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    // ... other safety settings ...
  ],
  generationConfig: {
    responseMimeType: "application/json",
  },
});

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

// Define example JSON outputs as separate strings for clarity
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
  const availableEvents = context.events || [];
  const eventContextString = availableEvents.length > 0
    ? `\\n\\nAvailable Events Context (Name, ID, Start Time):\\n${availableEvents.map(e => `- ${e.name} (ID: ${e.api_id}, Starts: ${e.start_at || 'N/A'})`).join('\\n')}`
    : "\\n\\nNo specific event context available.";

  // Build prompt parts
  const intro = `You are an AI assistant integrated with Luma (lu.ma) event management via its API.
Your task is to analyze user messages and determine the user's intent and extract relevant entities for API calls, using the provided context.`;
  const userRequestSection = `\n\nUser Request: "${text}"`;
  const contextSection = eventContextString;
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

  // Combine prompt parts
  const prompt = intro + userRequestSection + contextSection + outputFormatSection + rulesSection + examplesSection + finalInstruction;

  try {
    // Add a small delay to help mitigate rapid-fire requests hitting free tier limit
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

    // Construct the final prompt
    const fullPrompt = `${prompt}\n"${text}"`;

    // console.debug("Sending prompt to Gemini:", fullPrompt); // Uncomment for debugging

    // Call generateContent directly on the models collection using the new SDK pattern
    const result = await genAI.models.generateContent({
        model: model, // Pass model name here
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }], // Adjust structure if needed by new SDK
        safetySettings: safetySettings
        // generationConfig could be added here if needed
    });

    console.log("Raw Gemini API Result:", JSON.stringify(result, null, 2)); // Log raw result

    // Access candidates directly from the result object
    const candidates = result.candidates;

    if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0 || !candidates[0].content.parts[0].text) {
      console.error('No valid text part found in Gemini response candidates:', JSON.stringify(result, null, 2));
      // Check for block reason (assuming it might be on result or result.promptFeedback?)
      // Let's check the raw result structure log if this part fails
      const promptFeedback = result.promptFeedback; // Check if promptFeedback exists on result
      if (promptFeedback?.blockReason) {
        console.error("Prompt blocked:", promptFeedback.blockReason);
         return {
            intent: 'BLOCKED',
            entities: {},
            originalText: text,
            error: `Request blocked due to safety settings: ${promptFeedback.blockReason}`
        };
      }
      // Check for finish reason in candidate
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
      // Generic error if no specific reason found
      return {
        intent: 'UNKNOWN',
        entities: {},
        originalText: text,
        error: 'Received an empty or invalid response structure from AI model.',
        rawResponse: JSON.stringify(result, null, 2) // Log the full result structure
      };
    }
    const responseText = candidates[0].content.parts[0].text;

    console.log("Raw Gemini Response Text (pre-cleaning):", responseText);

    // Attempt to parse the JSON response (using existing robust logic)
    let parsedResponse;
    let cleanedText = responseText.trim();

    try {
      parsedResponse = JSON.parse(cleanedText);
    } catch (initialParseError) {
      console.warn("Initial JSON.parse failed, attempting extraction:", initialParseError.message);
      const jsonMatch = cleanedText.match(/{.*}/s);
      if (jsonMatch && jsonMatch[0]) {
        cleanedText = jsonMatch[0];
        console.log("Extracted JSON-like content:", cleanedText);
        try {
          parsedResponse = JSON.parse(cleanedText);
        } catch (secondaryParseError) {
          console.error("Failed to parse extracted Gemini JSON response:", secondaryParseError);
          console.error("Raw text that failed parsing (after extraction):", cleanedText);
          return {
            intent: 'UNKNOWN',
            entities: {},
            originalText: text,
            error: 'Failed to parse response from AI model.',
            rawResponse: responseText
          };
        }
      } else {
        console.error("Failed to parse Gemini JSON response and no {} block found:", initialParseError);
        console.error("Raw text that failed parsing:", responseText);
        return {
          intent: 'UNKNOWN',
          entities: {},
          originalText: text,
          error: 'Failed to parse response from AI model.',
          rawResponse: responseText
        };
      }
    }

    console.log("Parsed Gemini Response:", parsedResponse);
    parsedResponse.originalText = text;
    return parsedResponse;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Attempt to access potential safety feedback (structure might differ in new SDK)
    if (error.response && error.response.promptFeedback?.blockReason) {
        console.error("Gemini API request blocked:", error.response.promptFeedback.blockReason);
        return {
            intent: 'BLOCKED',
            entities: {},
            originalText: text,
            error: `Request blocked due to safety settings: ${error.response.promptFeedback.blockReason}`
        };
    }
    // Check if the error is a GoogleGenerativeAIFetchError and extract status/message
    // The specific error type name might vary based on the SDK version
    // Example check (adjust based on actual error object structure):
    if (error.name === 'GoogleGenerativeAIFetchError' || error.message?.includes('FetchError')) {
        const status = error.status || error.cause?.status; // Attempt to find status code
        const message = error.message;
        console.error(`Gemini API Fetch Error: Status ${status}, Message: ${message}`);
        return {
            intent: 'UNKNOWN',
            entities: {},
            originalText: text,
            error: `Failed to get response from AI model (API Error: ${status || 'Unknown Status'})`
        };
    }
    // Generic fallback
    return {
      intent: 'UNKNOWN',
      entities: {},
      originalText: text,
      error: 'Failed to get response from AI model.' // Keep generic error for now
    };
  }
}

/**
 * Takes raw data and instructions, asks Gemini to format it for the user.
 * @param {object|array} data - The raw data to be formatted (e.g., list of events, guests).
 * @param {string} instruction - Instruction for Gemini on how to format/present the data.
 * @returns {Promise<string>} - Gemini's formatted text response.
 * @throws {Error} - If the API call fails or returns an unexpected response.
 */
async function formatDataWithGemini(data, userQueryContext = "the user's request") {
  const formatPrompt = `
You are an AI assistant helping format data retrieved from the Luma API into a concise, user-friendly, natural language response for a chat bot (using Telegram MarkdownV2).

**Formatting Rules:**
*   Be concise and informative.
*   Use Telegram MarkdownV2 for formatting (bold, italics, inline code, links). Remember to escape characters: _, *, [, ], (, ), ~, \`, >, #, +, -, =, |, {, }, ., !
*   If data includes lists (like events or guests), format them clearly, potentially using bullet points (*).
*   If data includes flags like 'has_more', mention it (e.g., "Showing the first X results. There are more.").
*   If formatting event details, include key info like name, start time, and maybe location unless a specific detail was requested.
*   If formatting a specific requested detail (e.g., 'name', 'location'), just provide that detail clearly.
*   If data is empty or indicates an error state passed to you, state that clearly (e.g., "No events found matching your criteria.", "No guests found with status 'pending'.").
*   Tailor the response slightly based on the user's original query context if provided.

**Data:**
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

**User Query Context:**
"${userQueryContext}"

Format the above data into a natural language response based on the rules and the user's likely request. Remember to escape MarkdownV2 characters.
`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro-latest', // Use the appropriate model
      // safetySettings: adjustedSafetySettings, // Consider applying safety settings if needed
    });

    const result = await model.generateContent(formatPrompt);
    const response = await result.response;
    const text = response.text();
    // console.debug("Gemini Formatting Response:", text); // Uncomment for debugging
    return text;
  } catch (error) {
    console.error('Error formatting data with Gemini:', error);
    // Fallback to simple JSON stringification if Gemini fails
    return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
}

module.exports = {
  processNaturalLanguageQuery,
  formatDataWithGemini
}; 