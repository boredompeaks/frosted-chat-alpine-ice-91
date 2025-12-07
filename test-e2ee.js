// Simple test for E2EE encryption/decryption

// Simulate CryptoJS (we'll test in browser console instead)
// This is just a reference for manual testing

const testEncryption = () => {
  // Test data
  const password = "MySecureChat123";
  const chatId = "chat-abc-123";
  const message = "Hello, secure world!";

  console.log("=== E2EE Test ===");
  console.log("Password:", password);
  console.log("Chat ID:", chatId);
  console.log("Message:", message);

  // Expected flow:
  // 1. deriveChatKey(password, chatId) → generates key
  // 2. encryptMessage(message, key) → {ciphertext, iv}
  // 3. decryptMessage(ciphertext, iv, key) → "Hello, secure world!"

  // Test in browser console:
  // const { deriveChatKey, encryptMessage, decryptMessage } = await import('/src/lib/simpleE2EE.ts');
  // const key = deriveChatKey(password, chatId);
  // const encrypted = encryptMessage(message, key);
  // const decrypted = decryptMessage(encrypted.ciphertext, encrypted.iv, key);
  // console.log("Result:", decrypted);
  // console.log("Match:", decrypted === message);

  console.log("\nTest in browser console at http://localhost:8081/");
};

testEncryption();
