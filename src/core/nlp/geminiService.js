// Simplified geminiService.js for debugging

const config = require('../../config/config.js');

console.log('=== Gemini Service Initialization ===');
console.log('Config loaded:', {
  hasApiKey: !!config.gemini.apiKey,
  apiKeyLength: config.gemini.apiKey ? config.gemini.apiKey.length : 0,
  modelId: config.gemini.modelId
});

// Initialize Gemini client
let genAI = null;

try {
  console.log('Loading @google/genai module...');
  const genaiPackage = require('@google/genai');
  console.log('@google/genai module loaded successfully');
  
  if (!config.gemini.apiKey) {
    console.error('Missing GEMINI_API_KEY in config');
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  
  console.log('Initializing GoogleGenAI instance with API key...');
  // genAI = new genaiPackage.GoogleGenerativeAI(config.gemini.apiKey);
  // Check if the constructor is directly on the package or on .default
  const Constructor = genaiPackage.GoogleGenerativeAI || genaiPackage.default?.GoogleGenerativeAI || genaiPackage.default;
  if (!Constructor || typeof Constructor !== 'function') {
    console.error('Could not find GoogleGenerativeAI constructor in the imported package');
    throw new Error('Failed to find GoogleGenerativeAI constructor');
  }
  genAI = new Constructor(config.gemini.apiKey); 
  console.log('Gemini client instantiated successfully');
} catch (error) {
  console.error('Failed to initialize Gemini:', error);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
}

/**
 * Simple function to generate response via Gemini
 */
async function generateResponse(prompt) {
  if (!genAI) {
    console.error('Gemini service is not initialized - cannot generate response');
    return "Gemini service is not initialized. Please check API key configuration.";
  }
  
  try {
    console.log(`Generating response for: "${prompt.substring(0, 50)}..."`);
    const model = genAI.getGenerativeModel({ model: config.gemini.modelId || "gemini-2.0-flash" });
    console.log('Model initialized, sending content...');
    const result = await model.generateContent(prompt);
    console.log('Content generated, extracting response...');
    const response = result.response.text();
    console.log('Response extracted successfully');
    return response;
  } catch (error) {
    console.error('Error generating response:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return `Error generating response: ${error.message}`;
  }
}

console.log('Gemini service module loaded. Initialized:', !!genAI);

module.exports = {
  generateResponse,
  isInitialized: () => !!genAI
};