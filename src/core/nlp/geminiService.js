const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const config = require('../../config');

if (!config.gemini.apiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

// Initialize the Generative AI client
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Define safety settings (adjust as needed)
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

// Select the model
// Use a model suitable for function calling/structured output if possible (e.g., gemini-pro)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest', safetySettings });

/**
 * Processes natural language text using Gemini to extract intent and entities.
 * @param {string} text - The user's input text.
 * @param {object} context - Additional context (e.g., available events, user info).
 * @returns {Promise<object>} - A structured object representing the parsed intent and entities.
 */
async function processNaturalLanguageQuery(text, context = {}) {
  console.log(`Processing NLP query: "${text}" with context:`, context);

  // Extract relevant context (e.g., list of event names/IDs)
  const eventListContext = context.events?.map(e => `- ${e.name} (ID: ${e.api_id})`).join('\n') || 'No events available in context.';

  const prompt = `
You are an assistant helping manage Luma events via a Telegram bot.
Analyze the user's request: "${text}"

Context:
Available Events:
${eventListContext}

Identify the user's primary intent and extract relevant entities.
Possible Intents: LIST_EVENTS, GET_GUESTS, GET_GUEST_COUNT, APPROVE_GUEST, REJECT_GUEST, UNKNOWN.
Possible Entities: event_id, event_name, guest_email, status_filter (e.g., 'approved', 'pending_approval'), location, date_range.

If the user mentions an event name but it's ambiguous or doesn't match the context, set intent to UNKNOWN and include an 'ambiguous_event_name' entity.
If the request is unclear or lacks necessary information (e.g., approving without an email or event), set intent to UNKNOWN.

Respond ONLY with a valid JSON object containing:
- "intent": (string) The identified intent.
- "entities": (object) Key-value pairs of extracted entities.
- "confidence": (number) A confidence score from 0.0 to 1.0 for the intent and entities (estimate).
- "requires_clarification": (boolean) True if the bot should ask a follow-up question.
- "clarification_message": (string, optional) A suggested message if clarification is needed.

Example 1:
User: "Who is coming to the Summer Mixer?"
Response:
{
  "intent": "GET_GUESTS",
  "entities": { "event_name": "Summer Mixer" },
  "confidence": 0.9,
  "requires_clarification": false,
  "clarification_message": null
}

Example 2:
User: "How many approved for the Dubai event?"
Response:
{
  "intent": "GET_GUEST_COUNT",
  "entities": { "location": "Dubai", "status_filter": "approved" },
  "confidence": 0.8,
  "requires_clarification": true,
  "clarification_message": "Which Dubai event are you referring to? \nAvailable Dubai Events:\n- Dubai Tech Meetup (ID: evt_123)\n- Dubai Founders Brunch (ID: evt_456)"
}

Example 3:
User: "Approve hello@example.com for evt_abc123"
Response:
{
  "intent": "APPROVE_GUEST",
  "entities": { "guest_email": "hello@example.com", "event_id": "evt_abc123" },
  "confidence": 0.95,
  "requires_clarification": false,
  "clarification_message": null
}

Example 4:
User: "What's happening?"
Response:
{
  "intent": "UNKNOWN",
  "entities": {},
  "confidence": 0.5,
  "requires_clarification": true,
  "clarification_message": "I can help with Luma events. What would you like to know?"
}

Now analyze the user request: "${text}"
JSON Response:
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    console.log("Raw Gemini Response Text (pre-cleaning):", responseText);

    // Attempt to parse the JSON response
    let parsedResponse;
    let cleanedText = responseText.trim(); // Start with basic trimming

    try {
      parsedResponse = JSON.parse(cleanedText);
    } catch (initialParseError) {
      console.warn("Initial JSON.parse failed, attempting extraction:", initialParseError.message);
      // If initial parse fails, try extracting content between {}
      const jsonMatch = cleanedText.match(/{.*}/s); // Find text between the first { and last }
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
            rawResponse: responseText // Log the original raw response
          };
        }
      } else {
        // If no {} block found after initial parse failure
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
    // Add original text for reference downstream
    parsedResponse.originalText = text;
    return parsedResponse;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Handle potential safety blocks
    if (error.response && error.response.promptFeedback?.blockReason) {
        console.error("Gemini API request blocked:", error.response.promptFeedback.blockReason);
        return {
            intent: 'BLOCKED',
            entities: {},
            originalText: text,
            error: `Request blocked due to safety settings: ${error.response.promptFeedback.blockReason}`
        };
    }
    return {
      intent: 'UNKNOWN',
      entities: {},
      originalText: text,
      error: 'Failed to get response from AI model.'
    };
  }
}

module.exports = {
  processNaturalLanguageQuery,
}; 