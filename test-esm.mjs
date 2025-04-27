import { GoogleGenerativeAI } from '@google/genai';
import config from './src/config/config.js'; // Assuming config exports default or is CJS

console.log('=== ESM Test Start ===');

try {
    console.log('Attempting to import GoogleGenerativeAI via ESM...');
    if (typeof GoogleGenerativeAI !== 'function') {
        throw new Error('GoogleGenerativeAI imported via ESM is not a function!');
    }
    console.log('ESM import successful, constructor type:', typeof GoogleGenerativeAI);

    if (!config?.gemini?.apiKey) {
         console.warn('GEMINI_API_KEY not found in config for instantiation test.');
    } else {
        console.log('Attempting instantiation with API key...');
        const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
        console.log('ESM Instantiation successful! Instance:', genAI);
    }

} catch (error) {
    console.error('ESM Test Failed:', error);
}

console.log('=== ESM Test End ==='); 