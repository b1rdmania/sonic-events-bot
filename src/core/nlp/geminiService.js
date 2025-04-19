const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const config = require('../../config');
const { escapeMarkdownV2 } = require('../services/escapeUtil');

if (!config.gemini.apiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

// Initialize the Generative AI client using the new SDK pattern
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

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

// Model selection happens later, during the generateContent call
const modelName = 'gemini-2.0-flash'; // Use the desired model name

/**
 * Processes natural language text using Gemini to extract intent and entities.
 * @param {string} text - The user's input text.
 * @param {object} context - Additional context (e.g., available events, user info).
 * @returns {Promise<object>} - A structured object representing the parsed intent and entities.
 */
async function processNaturalLanguageQuery(text, context = {}) {
  console.log(`Processing NLP query: "${text}" with context:`, context);

  const eventListContext = context.events?.map(e => `- ${escapeMarkdownV2(e.name || 'Unknown Name')} (ID: ${escapeMarkdownV2(e.api_id || 'N/A')})`).join('\n') || 'No events available in context.';

  const prompt = `
You are an assistant managing Luma events via Telegram.
User request: "${text}"

Context:
Available Events:
${eventListContext}

Analyze the user request.
Identify the primary intent from: LIST_EVENTS, GET_GUESTS, GET_GUEST_COUNT, APPROVE_GUEST, REJECT_GUEST, UNKNOWN.
Extract relevant entities like: event_id, event_name, guest_email, status_filter (e.g., 'approved', 'pending_approval').

Respond ONLY with a valid JSON object containing:
- "intent": (string) The identified intent.
- "entities": (object) Key-value pairs of extracted entities.
- "confidence": (number) Confidence score [0.0-1.0].
- "requires_clarification": (boolean) True if more info needed.
- "clarification_message": (string, optional) Suggested follow-up message.

JSON Response:
`;

  try {
    // Add a small delay to help mitigate rapid-fire requests hitting free tier limit
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

    // Get the model instance using the new client
    const model = genAI.getGenerativeModel({ model: modelName });

    // Call generateContent with the new structure
    const result = await model.generateContent({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: safetySettings
        // generationConfig could be added here if needed
    });

    // Access response text using property (assuming .text based on Python example)
    const response = result.response;
    const responseText = response.text; // Use .text property

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
    return {
      intent: 'UNKNOWN',
      entities: {},
      originalText: text,
      error: 'Failed to get response from AI model.' // Keep generic error for now
    };
  }
}

module.exports = {
  processNaturalLanguageQuery,
}; 