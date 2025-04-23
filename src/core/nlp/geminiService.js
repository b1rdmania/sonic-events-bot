// Simplified geminiService.js for debugging

const config = require('../../config/config.js');
const { GoogleGenerativeAI } = require('@google/genai');

console.log('=== Gemini Service Initialization ===');
console.log('Config loaded:', {
  hasApiKey: !!config.gemini.apiKey,
  modelId: config.gemini.modelId
});

// Initialize Gemini client
let genAI = null;
try {
  if (!config.gemini.apiKey) {
    console.error('Missing GEMINI_API_KEY in config');
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  
  console.log('Initializing GoogleGenAI instance...');
  genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  console.log('Gemini client instantiated successfully');
} catch (error) {
  console.error('Failed to initialize Gemini:', error);
}

/**
 * Simple function to generate response via Gemini
 */
async function generateResponse(prompt) {
  if (!genAI) {
    return "Gemini service is not initialized.";
  }
  
  try {
    console.log(`Generating response for: "${prompt.substring(0, 50)}..."`);
    const model = genAI.getGenerativeModel({ model: config.gemini.modelId || "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.log('Response generated successfully');
    return response;
  } catch (error) {
    console.error('Error generating response:', error);
    return `Error: ${error.message}`;
  }
}

module.exports = {
  generateResponse
};