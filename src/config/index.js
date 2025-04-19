require('dotenv').config(); // Load .env file contents into process.env

const config = {
  telegram: {
    botToken: process.env.BOT_TOKEN,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  security: {
    // Ensure this key is handled securely and is the correct length/format for your crypto library
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
  luma: {
    // You might load a default test key here if needed, but generally,
    // the key will come from the database per-organization.
    // testApiKey: process.env.LUMA_API_KEY
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Basic validation (add more as needed)
if (!config.telegram.botToken) {
  throw new Error('Missing required environment variable: BOT_TOKEN');
}
if (!config.gemini.apiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}
if (!config.database.url) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}
if (!config.security.encryptionKey) {
  // Add length check depending on your chosen encryption algorithm (e.g., 64 hex chars for 32 bytes)
  throw new Error('Missing required environment variable: ENCRYPTION_KEY');
}


module.exports = config; 