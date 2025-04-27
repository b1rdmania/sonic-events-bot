// Original geminiService.js code

const { GoogleGenerativeAI } = require('@google/genai');
const config = require('../../config/config.js');

console.log('=== Gemini Service Initialization ===');
console.log('Config loaded:', {
  hasApiKey: !!config.gemini.apiKey,
  apiKeyLength: config.gemini.apiKey ? config.gemini.apiKey.length : 0,
  modelId: config.gemini.modelId
});

// Initialize Gemini client
let genAI = null;
let initializationError = null;

try {
  console.log('Loading @google/genai module...');
  // const { GoogleGenerativeAI } = require('@google/genai'); // Already required above
  console.log('@google/genai module loaded successfully');
  
  if (!config.gemini.apiKey) {
    console.error('Missing GEMINI_API_KEY in config');
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  
  console.log('Initializing GoogleGenAI instance with API key...');
  genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  console.log('Gemini client instantiated successfully');
} catch (error) {
  console.error('Failed to initialize Gemini:', error);
  initializationError = error; // Store the error
  // Keep genAI as null
}

/**
 * Simple function to generate response via Gemini
 */
async function generateResponse(prompt) {
  if (!genAI) {
    const errorMessage = initializationError 
      ? `Gemini service failed to initialize: ${initializationError.message}`
      : "Gemini service is not initialized. Check logs for details.";
    console.error(errorMessage);
    return `⚠️ ${errorMessage}`;
  }
  
  try {
    console.log(`Generating response for: "${prompt.substring(0, 50)}..."`);
    const model = genAI.getGenerativeModel({ model: config.gemini.modelId || "gemini-2.0-flash" });
    console.log('Model initialized, sending content...');
    const result = await model.generateContent(prompt);
    console.log('Content generated, extracting response...');
    const response = result.response?.text(); // Use optional chaining and call text()
    console.log('Response extracted successfully');
    return response || "⚠️ No response text received from Gemini.";
  } catch (error) {
    console.error('Error generating response:', error);
    return `⚠️ Error generating response: ${error.message}`;
  }
}

console.log('Gemini service module loaded. Initialized:', !!genAI);

module.exports = {
  generateResponse,
  isInitialized: () => !!genAI
};