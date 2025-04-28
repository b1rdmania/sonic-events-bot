// Original geminiService.js code - Using latest @google/genai package

console.log('=== Starting Gemini Service Debug ===');
console.log('Node version:', process.version);
console.log('Current working directory:', process.cwd());

const { GoogleGenAI } = require('@google/genai');
console.log('=== Package Debug ===');
console.log('Package type:', typeof GoogleGenAI);
console.log('Package keys:', Object.keys(GoogleGenAI));

const config = require('../../config/config.js');

console.log('=== Config Debug ===');
console.log('Config loaded:', {
  hasApiKey: !!config.gemini.apiKey,
  apiKeyLength: config.gemini.apiKey ? config.gemini.apiKey.length : 0,
  modelId: config.gemini.modelId
});

// Initialize Gemini client
let genAI = null;
let initializationError = null;

try {
  console.log('=== Initialization Attempt ===');
  console.log('Loading @google/genai module...');
  console.log('@google/genai module loaded successfully');
  
  if (!config.gemini.apiKey) {
    console.error('Missing GEMINI_API_KEY in config');
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  
  console.log('Initializing GoogleGenAI instance with API key...');
  genAI = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  console.log('Gemini client instantiated successfully');
} catch (error) {
  console.error('=== Initialization Error ===');
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
  initializationError = error;
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
    const result = await genAI.models.generateContent({
      model: config.gemini.modelId || "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    console.log('Content generated, extracting response...');
    const responseText = result.text;
    console.log('Response extracted successfully');
    return responseText || "⚠️ No response text received from Gemini.";
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