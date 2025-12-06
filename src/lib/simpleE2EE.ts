import CryptoJS from "crypto-js";

const PBKDF2_ITERATIONS = 150000;
const KEY_LENGTH = 256;
const SESSION_PASSWORD_KEY = "chat_session_passwords";
let lastActivity = Date.now();

export const deriveChatKey = (password, chatId) => {
  if (!password || !chatId) {
    throw new Error("Password and chatId are required");
  }
  const salt = CryptoJS.SHA256(chatId).toString();
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_LENGTH / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString(CryptoJS.enc.Base64);
};

export const encryptMessage = (message, key) => {
  if (!message || !key) {
    throw new Error("Message and key are required for encryption");
  }
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(message, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return {
    ciphertext: encrypted.toString(),
    iv: iv.toString(CryptoJS.enc.Base64),
  };
};

export const decryptMessage = (ciphertext, iv, key) => {
  if (!ciphertext || !iv || !key) {
    throw new Error("Ciphertext, IV, and key are required for decryption");
  }
  try {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
      iv: CryptoJS.enc.Base64.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    if (!plaintext) {
      throw new Error("Decryption failed - invalid password or corrupted data");
    }
    return plaintext;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export const getChatPassword = (chatId) => {
  if (!chatId) return null;
  try {
    const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY);
    if (!stored) return null;
    const passwords = JSON.parse(stored);
    return passwords[chatId] || null;
  } catch (error) {
    console.error("Error retrieving chat password:", error);
    return null;
  }
};

export const setChatPassword = (chatId, password) => {
  if (!chatId || !password) {
    throw new Error("ChatId and password are required");
  }
  try {
    const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY);
    const passwords = stored ? JSON.parse(stored) : {};
    passwords[chatId] = password;
    sessionStorage.setItem(SESSION_PASSWORD_KEY, JSON.stringify(passwords));
    lastActivity = Date.now();
  } catch (error) {
    console.error("Error storing chat password:", error);
    throw new Error("Failed to store password");
  }
};

export const clearChatPassword = (chatId) => {
  if (!chatId) return;
  try {
    const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY);
    if (!stored) return;
    const passwords = JSON.parse(stored);
    delete passwords[chatId];
    sessionStorage.setItem(SESSION_PASSWORD_KEY, JSON.stringify(passwords));
  } catch (error) {
    console.error("Error clearing chat password:", error);
  }
};

export const clearAllChatPasswords = () => {
  try {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY);
  } catch (error) {
    console.error("Error clearing all chat passwords:", error);
  }
};

export const hasChatPassword = (chatId) => {
  return getChatPassword(chatId) !== null;
};

export const getOrPromptPassword = async (chatId) => {
  const existing = getChatPassword(chatId);
  if (existing) {
    return existing;
  }
  // Throw error instead of using browser prompt
  // The UI should handle prompting via ChatPasswordPrompt component
  throw new Error("PASSWORD_REQUIRED");
};

export const validatePassword = (password) => {
  if (!password) {
    return { valid: false, error: "Password is required" };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
};

export const generateSecurePassword = (length = 16) => {
  const randomBytes = CryptoJS.lib.WordArray.random(length);
  const base64 = randomBytes.toString(CryptoJS.enc.Base64);
  return base64.replace(/[^a-zA-Z0-9]/g, "").substring(0, length);
};

export const createEncryptedMessage = (content, senderId, key) => {
  const metadata = {
    content,
    senderId,
    timestamp: Date.now(),
  };
  const { ciphertext, iv } = encryptMessage(JSON.stringify(metadata), key);
  return {
    encryptedContent: JSON.stringify({ ciphertext, iv }),
  };
};

export const decryptMessageWithMetadata = (encryptedData, key) => {
  try {
    const parsed = JSON.parse(encryptedData);
    const decrypted = decryptMessage(parsed.ciphertext, parsed.iv, key);
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error("Failed to decrypt message or invalid message format");
  }
};

export default {
  deriveChatKey,
  encryptMessage,
  decryptMessage,
  getChatPassword,
  setChatPassword,
  clearChatPassword,
  clearAllChatPasswords,
  hasChatPassword,
  getOrPromptPassword,
  validatePassword,
  generateSecurePassword,
  createEncryptedMessage,
  decryptMessageWithMetadata,
};
