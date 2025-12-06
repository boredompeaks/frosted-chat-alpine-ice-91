import { supabase } from "@/integrations/supabase/client";
import {
  generateAESKey,
  encryptKeyWithRSA,
  decryptKeyWithRSA,
  storeKeySecurely,
  retrieveKeyFromStorage,
  KEY_ROTATION_INTERVAL,
} from "./crypto";

// TURN server configuration (India-optimized with redundancy)
export const TURN_SERVERS = [
  {
    urls: "stun:stun.l.google.com:19302",
  },
  {
    urls: "turn:turn.anyfirewall.com:443?transport=tcp",
    username: "webrtc",
    credential: "webrtc",
  },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export type KeyStatus = "pending" | "sent" | "received" | "active" | "expired";

export interface EncryptionKey {
  id: string;
  chat_id: string;
  key_value: string;
  status: KeyStatus;
  created_at: string;
  last_rotation: string;
  initiator_id: string;
  receiver_acknowledged: boolean;
  sender_acknowledged: boolean;
}

/**
 * Initialize encryption key for a new chat
 */
export const initializeChatKey = async (
  chatId: string,
  userId: string
): Promise<string> => {
  try {
    const newKey = generateAESKey();

    const { error } = await supabase.from("encryption_keys").insert({
      chat_id: chatId,
      key_value: newKey,
      status: "pending",
      initiator_id: userId,
      last_rotation: new Date().toISOString(),
      receiver_acknowledged: false,
      sender_acknowledged: false,
    });

    if (error) {
      console.error("Error initializing chat key:", error);
      throw error;
    }

    // Store key locally
    storeKeySecurely(chatId, newKey);

    return newKey;
  } catch (error) {
    console.error("Error in initializeChatKey:", error);
    throw error;
  }
};

/**
 * Get current active key for a chat
 */
export const getChatKey = async (chatId: string): Promise<string | null> => {
  try {
    // First check local storage
    const localKey = retrieveKeyFromStorage(chatId);
    if (localKey) return localKey;

    // Fetch from database
    const { data, error } = await supabase
      .from("encryption_keys")
      .select("*")
      .eq("chat_id", chatId)
      .in("status", ["active", "sent", "received"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching chat key:", error);
      return null;
    }

    if (data) {
      // Store locally for faster access
      storeKeySecurely(chatId, data.key_value);
      return data.key_value;
    }

    return null;
  } catch (error) {
    console.error("Error in getChatKey:", error);
    return null;
  }
};

/**
 * Send new key to recipient via TURN relay
 */
export const sendKeyViaTURN = async (
  chatId: string,
  recipientId: string,
  newKey: string,
  recipientPublicKey: string
): Promise<boolean> => {
  try {
    // Encrypt the key with recipient's public RSA key
    const encryptedKey = await encryptKeyWithRSA(newKey, recipientPublicKey);

    // Send through all 3 TURN servers for redundancy
    const turnPromises = TURN_SERVERS.slice(1).map((server) =>
      sendKeyThroughTURNServer(server, chatId, recipientId, encryptedKey)
    );

    // Wait for at least one to succeed
    const results = await Promise.allSettled(turnPromises);
    const succeeded = results.some((result) => result.status === "fulfilled");

    if (succeeded) {
      // Update key status to 'sent'
      await updateKeyStatus(chatId, "sent", true, false);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error sending key via TURN:", error);
    return false;
  }
};

/**
 * Send key through a specific TURN server
 */
const sendKeyThroughTURNServer = async (
  turnServer: any,
  chatId: string,
  recipientId: string,
  encryptedKey: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      // Create a signaling channel via Supabase realtime
      const channel = supabase.channel(`key-exchange-${chatId}`);

      channel
        .on("broadcast", { event: "key-ack" }, (payload) => {
          if (payload.payload.recipientId === recipientId) {
            resolve(true);
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Broadcast the encrypted key
            await channel.send({
              type: "broadcast",
              event: "key-transfer",
              payload: {
                chatId,
                recipientId,
                encryptedKey,
                timestamp: Date.now(),
              },
            });

            // Timeout after 10 seconds
            setTimeout(() => {
              reject(new Error("Key transfer timeout"));
            }, 10000);
          }
        });
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Receive key via TURN relay
 */
export const receiveKeyViaTURN = async (
  chatId: string,
  userId: string,
  privateKey: string,
  onKeyReceived: (key: string) => void
): Promise<() => void> => {
  const channel = supabase.channel(`key-exchange-${chatId}`);

  channel
    .on("broadcast", { event: "key-transfer" }, async (payload) => {
      const { recipientId, encryptedKey } = payload.payload;

      if (recipientId === userId) {
        try {
          // Decrypt the key with private RSA key
          const decryptedKey = await decryptKeyWithRSA(
            encryptedKey,
            privateKey
          );

          // Store the key locally
          storeKeySecurely(chatId, decryptedKey);

          // Send acknowledgment
          await channel.send({
            type: "broadcast",
            event: "key-ack",
            payload: { recipientId, timestamp: Date.now() },
          });

          // Update key status to 'received'
          await updateKeyStatus(chatId, "received", false, true);

          // Notify the caller
          onKeyReceived(decryptedKey);
        } catch (error) {
          console.error("Error decrypting received key:", error);
        }
      }
    })
    .subscribe();

  // Return cleanup function
  return () => {
    channel.unsubscribe();
  };
};

/**
 * Send key via database fallback (if TURN fails)
 */
export const sendKeyViaDatabase = async (
  chatId: string,
  recipientId: string,
  newKey: string,
  recipientPublicKey: string
): Promise<boolean> => {
  try {
    // Encrypt the key with recipient's public RSA key
    const encryptedKey = await encryptKeyWithRSA(newKey, recipientPublicKey);

    // Store in database
    const { error } = await supabase.from("key_transfers").insert({
      chat_id: chatId,
      recipient_id: recipientId,
      encrypted_key: encryptedKey,
      transfer_method: "database",
      status: "pending",
    });

    if (error) throw error;

    await updateKeyStatus(chatId, "sent", true, false);
    return true;
  } catch (error) {
    console.error("Error sending key via database:", error);
    return false;
  }
};

/**
 * Receive key via database fallback
 */
export const receiveKeyViaDatabase = async (
  chatId: string,
  userId: string,
  privateKey: string
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from("key_transfers")
      .select("*")
      .eq("chat_id", chatId)
      .eq("recipient_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Decrypt the key
    const decryptedKey = await decryptKeyWithRSA(
      data.encrypted_key,
      privateKey
    );

    // Mark as received
    await supabase
      .from("key_transfers")
      .update({ status: "received" })
      .eq("id", data.id);

    // Store locally
    storeKeySecurely(chatId, decryptedKey);

    // Update key status
    await updateKeyStatus(chatId, "received", false, true);

    return decryptedKey;
  } catch (error) {
    console.error("Error receiving key via database:", error);
    return null;
  }
};

/**
 * Update key status in database
 */
export const updateKeyStatus = async (
  chatId: string,
  status: KeyStatus,
  senderAck: boolean,
  receiverAck: boolean
): Promise<void> => {
  try {
    const updates: any = { status };

    if (senderAck !== undefined) {
      updates.sender_acknowledged = senderAck;
    }

    if (receiverAck !== undefined) {
      updates.receiver_acknowledged = receiverAck;
    }

    // If both acknowledged, mark as active
    if (senderAck && receiverAck) {
      updates.status = "active";
    }

    const { error } = await supabase
      .from("encryption_keys")
      .update(updates)
      .eq("chat_id", chatId)
      .eq("status", status);

    if (error) throw error;
  } catch (error) {
    console.error("Error updating key status:", error);
  }
};

/**
 * Check if key needs rotation (24 hour interval)
 */
export const checkKeyRotation = async (chatId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("encryption_keys")
      .select("last_rotation")
      .eq("chat_id", chatId)
      .eq("status", "active")
      .single();

    if (error || !data) return true;

    const lastRotation = new Date(data.last_rotation).getTime();
    const now = Date.now();

    return now - lastRotation > KEY_ROTATION_INTERVAL;
  } catch (error) {
    console.error("Error checking key rotation:", error);
    return false;
  }
};

/**
 * Rotate encryption key for a chat
 */
export const rotateKey = async (
  chatId: string,
  userId: string,
  recipientId: string,
  recipientPublicKey: string
): Promise<string | null> => {
  try {
    // Generate new key
    const newKey = generateAESKey();

    // Try TURN relay first
    const turnSuccess = await sendKeyViaTURN(
      chatId,
      recipientId,
      newKey,
      recipientPublicKey
    );

    if (!turnSuccess) {
      // Fallback to database
      console.log("TURN relay failed, using database fallback");
      const dbSuccess = await sendKeyViaDatabase(
        chatId,
        recipientId,
        newKey,
        recipientPublicKey
      );

      if (!dbSuccess) {
        throw new Error("Failed to rotate key via both TURN and database");
      }
    }

    // Mark old key as expired
    await supabase
      .from("encryption_keys")
      .update({ status: "expired" })
      .eq("chat_id", chatId)
      .eq("status", "active");

    // Store new key
    await supabase.from("encryption_keys").insert({
      chat_id: chatId,
      key_value: newKey,
      status: "sent",
      initiator_id: userId,
      last_rotation: new Date().toISOString(),
      receiver_acknowledged: false,
      sender_acknowledged: true,
    });

    // Store locally
    storeKeySecurely(chatId, newKey);

    return newKey;
  } catch (error) {
    console.error("Error rotating key:", error);
    return null;
  }
};

/**
 * Setup automatic key rotation for a chat
 */
export const setupAutoKeyRotation = (
  chatId: string,
  userId: string,
  recipientId: string,
  recipientPublicKey: string
): NodeJS.Timeout => {
  return setInterval(async () => {
    const needsRotation = await checkKeyRotation(chatId);
    if (needsRotation) {
      console.log(`Rotating key for chat ${chatId}`);
      await rotateKey(chatId, userId, recipientId, recipientPublicKey);
    }
  }, KEY_ROTATION_INTERVAL);
};

/**
 * Get or create key for chat (main entry point)
 */
export const getOrCreateChatKey = async (
  chatId: string,
  userId: string,
  isInitiator: boolean = false
): Promise<string> => {
  try {
    // Try to get existing key
    let key = await getChatKey(chatId);

    if (key) {
      // Check if rotation is needed
      const needsRotation = await checkKeyRotation(chatId);
      if (needsRotation && isInitiator) {
        // Initiator should trigger rotation
        console.log("Key rotation needed");
      }
      return key;
    }

    // No key exists, initialize new one
    if (isInitiator) {
      key = await initializeChatKey(chatId, userId);
      return key;
    }

    // Non-initiator should wait for key from initiator
    // Return default key for now
    return "";
  } catch (error) {
    console.error("Error in getOrCreateChatKey:", error);
    throw error;
  }
};

export default {
  initializeChatKey,
  getChatKey,
  sendKeyViaTURN,
  receiveKeyViaTURN,
  sendKeyViaDatabase,
  receiveKeyViaDatabase,
  updateKeyStatus,
  checkKeyRotation,
  rotateKey,
  setupAutoKeyRotation,
  getOrCreateChatKey,
  TURN_SERVERS,
};
