// NEW CRYPTO IMPLEMENTATION - Test version
import CryptoJS from "crypto-js";

// Test function to see if PBKDF2 works
export const testPBKDF2 = (password: string, salt: string = "CalcIta_Salt_2024"): string => {
  console.log("🧪 TEST PBKDF2 - Input password:", password);
  console.log("🧪 TEST PBKDF2 - Salt:", salt);
  console.log("🧪 TEST PBKDF2 - CryptoJS available:", !!CryptoJS);
  
  try {
    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 8, // 256 / 32
      iterations: 10000,
    });
    
    console.log("🧪 TEST PBKDF2 - Result object:", key);
    console.log("🧪 TEST PBKDF2 - Result type:", typeof key);
    console.log("🧪 TEST PBKDF2 - Result constructor:", key?.constructor?.name);
    
    const base64Result = key.toString(CryptoJS.enc.Base64);
    
    console.log("🧪 TEST PBKDF2 - Base64 result:", base64Result);
    console.log("🧪 TEST PBKDF2 - Base64 length:", base64Result.length);
    
    return base64Result;
  } catch (error) {
    console.error("🧪 TEST PBKDF2 - ERROR:", error);
    throw error;
  }
};

// New derive key function with explicit checks
export const deriveKeyFromPasswordNew = (
  password: string,
  salt: string = "CalcIta_Salt_2024",
): string => {
  console.log("\n🚀 NEW deriveKeyFromPassword - START");
  console.log("Input password:", password);
  console.log("Input salt:", salt);
  
  if (!password) {
    throw new Error("Password is required");
  }
  
  // Validate CryptoJS is available
  if (!CryptoJS) {
    throw new Error("CryptoJS not loaded");
  }
  
  if (!CryptoJS.PBKDF2) {
    throw new Error("CryptoJS.PBKDF2 not available");
  }
  
  // Call PBKDF2
  const result = testPBKDF2(password, salt);
  
  console.log("🚀 NEW deriveKeyFromPassword - FINAL RESULT:", result);
  console.log("🚀 NEW deriveKeyFromPassword - END\n");
  
  return result;
};
