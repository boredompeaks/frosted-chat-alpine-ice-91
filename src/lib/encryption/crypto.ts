import CryptoJS from "crypto-js";

// Default hardcoded session key for bootstrapping (first-time messages)
const DEFAULT_SESSION_KEY = "CalcIta_Default_Bootstrap_Key_2024_Secure_Messaging_AES256";

// Key rotation interval (24 hours in milliseconds)
export const KEY_ROTATION_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * Generate a random AES-256 key
 */
export const generateAESKey = (): string => {
  const randomBytes = CryptoJS.lib.WordArray.random(32); // 256 bits
  return CryptoJS.enc.Base64.stringify(randomBytes);
};

/**
 * Generate RSA-2048 key pair using Web Crypto API
 */
export const generateRSAKeyPair = async (): Promise<{
  publicKey: string;
  privateKey: string;
}> => {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const publicKey = await window.crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey
    );
    const privateKey = await window.crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey
    );

    return {
      publicKey: arrayBufferToBase64(publicKey),
      privateKey: arrayBufferToBase64(privateKey),
    };
  } catch (error) {
    console.error("Error generating RSA key pair:", error);
    throw new Error("Failed to generate RSA key pair");
  }
};

/**
 * Encrypt AES key with RSA public key
 */
export const encryptKeyWithRSA = async (
  aesKey: string,
  publicKeyPEM: string
): Promise<string> => {
  try {
    const publicKey = await importRSAPublicKey(publicKeyPEM);
    const keyData = base64ToArrayBuffer(aesKey);

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      keyData
    );

    return arrayBufferToBase64(encrypted);
  } catch (error) {
    console.error("Error encrypting key with RSA:", error);
    throw new Error("Failed to encrypt key with RSA");
  }
};

/**
 * Decrypt AES key with RSA private key
 */
export const decryptKeyWithRSA = async (
  encryptedKey: string,
  privateKeyPEM: string
): Promise<string> => {
  try {
    const privateKey = await importRSAPrivateKey(privateKeyPEM);
    const encryptedData = base64ToArrayBuffer(encryptedKey);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      encryptedData
    );

    return arrayBufferToBase64(decrypted);
  } catch (error) {
    console.error("Error decrypting key with RSA:", error);
    throw new Error("Failed to decrypt key with RSA");
  }
};

/**
 * Encrypt message using AES-256-GCM
 */
export const encryptMessage = (
  message: string,
  key?: string
): { ciphertext: string; iv: string; tag: string } => {
  try {
    const encryptionKey = key || DEFAULT_SESSION_KEY;

    // Generate random IV
    const iv = CryptoJS.lib.WordArray.random(12); // 96 bits for GCM

    // Derive key from string
    const derivedKey = CryptoJS.SHA256(encryptionKey);

    // Encrypt with AES-GCM
    const encrypted = CryptoJS.AES.encrypt(message, derivedKey, {
      iv: iv,
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.NoPadding,
    });

    return {
      ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
      iv: iv.toString(CryptoJS.enc.Base64),
      tag: encrypted.tag ? encrypted.tag.toString(CryptoJS.enc.Base64) : "",
    };
  } catch (error) {
    console.error("Error encrypting message:", error);
    throw new Error("Failed to encrypt message");
  }
};

/**
 * Decrypt message using AES-256-GCM
 */
export const decryptMessage = (
  ciphertext: string,
  iv: string,
  tag: string,
  key?: string
): string => {
  try {
    const decryptionKey = key || DEFAULT_SESSION_KEY;

    // Derive key from string
    const derivedKey = CryptoJS.SHA256(decryptionKey);

    // Parse IV and tag
    const ivWordArray = CryptoJS.enc.Base64.parse(iv);
    const tagWordArray = tag ? CryptoJS.enc.Base64.parse(tag) : undefined;
    const ciphertextWordArray = CryptoJS.enc.Base64.parse(ciphertext);

    // Decrypt with AES-GCM
    const decrypted = CryptoJS.AES.decrypt(
      {
        ciphertext: ciphertextWordArray,
        tag: tagWordArray,
        salt: CryptoJS.lib.WordArray.create(),
      } as any,
      derivedKey,
      {
        iv: ivWordArray,
        mode: CryptoJS.mode.GCM,
        padding: CryptoJS.pad.NoPadding,
      }
    );

    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      throw new Error("Decryption failed - empty result");
    }

    return decryptedText;
  } catch (error) {
    console.error("Error decrypting message:", error);
    throw new Error("Failed to decrypt message");
  }
};

/**
 * Encrypt message with metadata (includes timestamp and sender info)
 */
export const encryptMessageWithMetadata = (
  message: string,
  senderId: string,
  key?: string
): string => {
  const metadata = {
    content: message,
    senderId,
    timestamp: Date.now(),
  };

  const encrypted = encryptMessage(JSON.stringify(metadata), key);
  return JSON.stringify(encrypted);
};

/**
 * Decrypt message and extract metadata
 */
export const decryptMessageWithMetadata = (
  encryptedData: string,
  key?: string
): { content: string; senderId: string; timestamp: number } => {
  try {
    const parsed = JSON.parse(encryptedData);
    const decrypted = decryptMessage(
      parsed.ciphertext,
      parsed.iv,
      parsed.tag,
      key
    );
    return JSON.parse(decrypted);
  } catch (error) {
    console.error("Error decrypting message with metadata:", error);
    throw new Error("Failed to decrypt message");
  }
};

/**
 * Sanitize input to prevent XSS
 */
export const sanitizeInput = (input: string): string => {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
};

/**
 * Escape HTML entities
 */
export const escapeHTML = (text: string): string => {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

/**
 * Validate message format
 */
export const validateEncryptedMessage = (data: any): boolean => {
  try {
    if (typeof data === "string") {
      data = JSON.parse(data);
    }
    return (
      typeof data === "object" &&
      typeof data.ciphertext === "string" &&
      typeof data.iv === "string" &&
      typeof data.tag === "string"
    );
  } catch {
    return false;
  }
};

/**
 * Generate secure random string
 */
export const generateSecureRandom = (length: number = 32): string => {
  const randomBytes = CryptoJS.lib.WordArray.random(length);
  return CryptoJS.enc.Base64.stringify(randomBytes);
};

/**
 * Hash data using SHA-256
 */
export const hashData = (data: string): string => {
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
};

/**
 * Derive key from password using PBKDF2
 */
export const deriveKeyFromPassword = (
  password: string,
  salt: string = "CalcIta_Salt_2024"
): string => {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 10000,
  });
  return key.toString(CryptoJS.enc.Base64);
};

// Helper functions for Web Crypto API
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const importRSAPublicKey = async (pemKey: string): Promise<CryptoKey> => {
  const keyData = base64ToArrayBuffer(pemKey);
  return await window.crypto.subtle.importKey(
    "spki",
    keyData,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
};

const importRSAPrivateKey = async (pemKey: string): Promise<CryptoKey> => {
  const keyData = base64ToArrayBuffer(pemKey);
  return await window.crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
};

/**
 * Store keys securely in localStorage (encrypted with user's master key)
 */
export const storeKeySecurely = (
  keyId: string,
  key: string,
  masterKey?: string
): void => {
  try {
    const storageKey = `calcita_key_${keyId}`;
    if (masterKey) {
      const encrypted = encryptMessage(key, masterKey);
      localStorage.setItem(storageKey, JSON.stringify(encrypted));
    } else {
      localStorage.setItem(storageKey, key);
    }
  } catch (error) {
    console.error("Error storing key:", error);
  }
};

/**
 * Retrieve key from secure storage
 */
export const retrieveKeyFromStorage = (
  keyId: string,
  masterKey?: string
): string | null => {
  try {
    const storageKey = `calcita_key_${keyId}`;
    const stored = localStorage.getItem(storageKey);

    if (!stored) return null;

    if (masterKey) {
      const encrypted = JSON.parse(stored);
      return decryptMessage(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        masterKey
      );
    }

    return stored;
  } catch (error) {
    console.error("Error retrieving key:", error);
    return null;
  }
};

/**
 * Clear all stored keys
 */
export const clearAllKeys = (): void => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith("calcita_key_")) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error("Error clearing keys:", error);
  }
};

export default {
  generateAESKey,
  generateRSAKeyPair,
  encryptKeyWithRSA,
  decryptKeyWithRSA,
  encryptMessage,
  decryptMessage,
  encryptMessageWithMetadata,
  decryptMessageWithMetadata,
  sanitizeInput,
  escapeHTML,
  validateEncryptedMessage,
  generateSecureRandom,
  hashData,
  deriveKeyFromPassword,
  storeKeySecurely,
  retrieveKeyFromStorage,
  clearAllKeys,
};
