// Simplified geminiService.js for debugging

const { GoogleGenerativeAI } = require('@google/genai');
const config = require('../../config/config.js'); // Adjusted path assuming config is two levels up

console.log('=== Gemini Service Initialization ===');
console.log('Config loaded:', {
  hasApiKey: !!config.gemini.apiKey,
  apiKeyLength: config.gemini.apiKey ? config.gemini.apiKey.length : 0,
  modelId: config.gemini.modelId
});

// Initialize Gemini client
let genAI = null;

try {
  console.log('Attempting to initialize GoogleGenerativeAI...'); // Added log
  genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  console.log('GoogleGenerativeAI initialized successfully.'); // Added log
} catch (error) {
  console.error('⚠️ Gemini initialization failed:', error);
  console.warn('⚠️ Initializing mock Gemini client as fallback.'); // Added log
  genAI = {
    // Mock a fallback client
    getGenerativeModel: () => ({ // Mock this method too as it's used later
        generateContent: async (prompt) => { // Match expected structure
            console.log('Mock Gemini responding to prompt:', prompt); // Added log
            return {
              response: { text: () => `⚠️ Gemini unavailable. Echo: ${prompt}` } // Match expected structure (text() method)
            };
        }
    })
  };
}

/**
 * Simple function to generate response via Gemini
 */
async function generateResponse(prompt) {
  if (!genAI) {
    console.error('Gemini service completely unavailable (genAI is null).'); // Added log
    return "⚠️ Gemini service completely unavailable.";
  }
  
  try {
    console.log(`Sending prompt to Gemini (or mock): "${prompt.substring(0, 50)}..."`); // Added log
    const model = genAI.getGenerativeModel({ model: config.gemini.modelId || "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response?.text(); // Call text() method
    console.log('Received response from Gemini (or mock):', responseText); // Added log
    return responseText || "⚠️ No response from Gemini.";
  } catch (error) {
    console.error('⚠️ Gemini request failed:', error);
    return "⚠️ Error using Gemini service.";
  }
}

console.log('Gemini service module loaded. Initialized:', !!genAI);

module.exports = {
  generateResponse,
  isInitialized: () => !!genAI && typeof genAI.getGenerativeModel === 'function' // Adjusted check for mock/real client
};