// Original geminiService.js code - Attempting direct property access and default check

const genaiPackage = require('@google/genai'); // Import the whole package
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
  console.log('@google/genai module loaded successfully');
  
  // Attempt to find the constructor, checking direct property and default export
  const GoogleGenerativeAI = genaiPackage.GoogleGenerativeAI || genaiPackage.default?.GoogleGenerativeAI || genaiPackage.default;

  if (!GoogleGenerativeAI || typeof GoogleGenerativeAI !== 'function') {
      console.error('Could not find GoogleGenerativeAI constructor in the imported package (checked direct and default).');
      console.log('Imported package object structure:', Object.keys(genaiPackage)); // Log keys to see structure
      if (genaiPackage.default) {
        console.log('Imported package.default object structure:', Object.keys(genaiPackage.default));
      }
      throw new Error('Failed to find GoogleGenerativeAI constructor');
  }

  if (!config.gemini.apiKey) {
    console.error('Missing GEMINI_API_KEY in config');
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  
  console.log('Initializing GoogleGenAI instance with API key...');
  genAI = new GoogleGenerativeAI(config.gemini.apiKey); // Use the found constructor
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