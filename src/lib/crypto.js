const config = require('../config/config.js');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES-GCM
const AUTH_TAG_LENGTH = 16;

// Ensure the encryption key is the correct length (32 bytes for AES-256)
const encryptionKeyString = config.security.encryptionKey;
if (!encryptionKeyString || Buffer.from(encryptionKeyString, 'hex').length !== 32) {
  throw new Error('Invalid ENCRYPTION_KEY: Must be a 32-byte key (64 hex characters).');
}
const key = Buffer.from(encryptionKeyString, 'hex');

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} - A string containing the IV, auth tag, and ciphertext, concatenated and base64 encoded.
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Concatenate iv, authTag, and ciphertext, then encode as base64 for easier storage
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

/**
 * Decrypts text encrypted with AES-256-GCM.
 * @param {string} encryptedData - The base64 encoded string containing IV, auth tag, and ciphertext.
 * @returns {string} - The original plaintext.
 * @throws {Error} - If decryption fails (e.g., wrong key, tampered data).
 */
function decrypt(encryptedData) {
  try {
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract IV, auth tag, and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8'); // Input encoding is 'hex' from Buffer conversion
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    // It's often better to throw a generic error in production to avoid leaking details
    throw new Error('Failed to decrypt data.');
  }
}

module.exports = {
  encrypt,
  decrypt,
}; 