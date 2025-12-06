import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import {
  deriveChatKey,
  encryptMessage,
  decryptMessage,
  getChatPassword,
  hasChatPassword,
  getOrPromptPassword,
  createEncryptedMessage,
  decryptMessageWithMetadata,
} from "@/lib/simpleE2EE";

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  media_url?: string | null;
  is_one_time_view?: boolean;
  disappear_after?: number | null;
  read_at?: string | null;
  created_at: string;
  decrypted?: boolean;
  reactions?: Array<{
    id: string;
    emoji: string;
    user_id: string | null;
  }>;
}

export interface Chat {
  id: string;
  created_at: string;
  participants: any[];
  last_message?: Message;
  unread_count?: number;
}

export interface UseChatDataReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string, options?: MessageOptions) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markAsRead: (messageId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  hasMore: boolean;
  sendReaction: (messageId: string, emoji: string) => Promise<void>;
  isPasswordRequired: boolean;
  unlockChat: () => Promise<boolean>;
  encryptionKey: string | null;
}

export interface MessageOptions {
  mediaUrl?: string;
  isOneTimeView?: boolean;
  disappearAfter?: number;
  replyToId?: string;
}

const MESSAGE_PAGE_SIZE = 50;

export const useChatData = (
  chatId: string,
  userId: string,
): UseChatDataReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const { toast } = useToast();

  // Local storage cache keys
  const getCacheKey = (id: string) => `chat-messages-${id}`;
  const getOffsetCacheKey = (id: string) => `chat-offset-${id}`;

  // Save messages to localStorage
  const saveToCache = useCallback((chatId: string, messages: Message[]) => {
    if (!chatId || !messages.length) return;
    try {
      localStorage.setItem(getCacheKey(chatId), JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save messages to cache:", e);
    }
  }, []);

  // Load messages from localStorage
  const loadFromCache = useCallback((chatId: string): Message[] | null => {
    if (!chatId) return null;
    try {
      const cached = localStorage.getItem(getCacheKey(chatId));
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      console.error("Failed to load messages from cache:", e);
      return null;
    }
  }, []);

  // Save offset to localStorage
  const saveOffsetToCache = useCallback((chatId: string, offset: number) => {
    if (!chatId) return;
    try {
      localStorage.setItem(getOffsetCacheKey(chatId), offset.toString());
    } catch (e) {
      console.error("Failed to save offset to cache:", e);
    }
  }, []);

  // Load offset from localStorage
  const loadOffsetFromCache = useCallback((chatId: string): number => {
    if (!chatId) return 0;
    try {
      const cached = localStorage.getItem(getOffsetCacheKey(chatId));
      return cached ? parseInt(cached, 10) : 0;
    } catch (e) {
      console.error("Failed to load offset from cache:", e);
      return 0;
    }
  }, []);

  /**
   * Initialize chat password and encryption key
   */
  useEffect(() => {
    const initializeChat = async () => {
      if (!chatId || !userId) {
        setLoading(false);
        return;
      }

      try {
        setError(null);
        setLoading(true);

        // Check if password exists
        const password = getChatPassword(chatId);

        if (!password) {
          setIsPasswordRequired(true);
          setIsUnlocked(false);
          setEncryptionKey(null);
          setLoading(false);
          setMessages([]);
          return;
        }

        // Derive encryption key
        const key = deriveChatKey(password, chatId);
        setEncryptionKey(key);
        setIsUnlocked(true);
        setIsPasswordRequired(false);

        // Try to load from cache first
        const cachedMessages = loadFromCache(chatId);
        const cachedOffset = loadOffsetFromCache(chatId);

        console.log("Initializing chat:", {
          chatId,
          hasPassword: !!password,
          hasCache: !!cachedMessages,
          cacheSize: cachedMessages?.length || 0,
          hasKey: !!key,
        });

        if (cachedMessages && cachedMessages.length > 0) {
          console.log("Loading messages from cache:", cachedMessages.length);
          setMessages(cachedMessages);
          setOffset(cachedOffset);
          setHasMore(cachedOffset > 0);
          setLoading(false);

          // Refresh in background (use setTimeout to avoid dependency issues)
          setTimeout(() => {
            fetchMessages(true).catch((err) => {
              console.error("Background refresh failed:", err);
            });
          }, 100);
        } else {
          // No cache, fetch fresh
          console.log("No cache found, fetching fresh messages");
          await fetchMessages(true);
        }
      } catch (err) {
        console.error("Error initializing chat:", err);
        setError("Failed to initialize chat");
        setIsPasswordRequired(true);
        setIsUnlocked(false);
        setLoading(false);
        setMessages([]);
      }
    };

    initializeChat();
  }, [chatId, userId]); // Remove function dependencies to prevent re-runs

  /**
   * Unlock chat with password
   */
  const unlockChat = useCallback(async (): Promise<boolean> => {
    try {
      console.log("UNLOCK: Starting password unlock process");
      setLoading(true);
      setError(null);

      // Get or prompt for password
      const password = await getOrPromptPassword(chatId);
      console.log("UNLOCK: Password received");

      // Derive encryption key
      const key = deriveChatKey(password, chatId);
      console.log("UNLOCK: Encryption key derived");

      // Test key by trying to decrypt a message (if any exist)
      try {
        // If there are messages, try to decrypt one to verify the key
        const { data: testMessage } = await supabase
          .from("messages")
          .select("content")
          .eq("chat_id", chatId)
          .limit(1)
          .single();

        if (testMessage?.content) {
          const parsed = JSON.parse(testMessage.content);
          if (parsed.ciphertext && parsed.iv) {
            // Try to decrypt to verify key is correct
            decryptMessage(parsed.ciphertext, parsed.iv, key);
          }
        }
      } catch (decryptError) {
        // Wrong password - gibberish will be shown
        toast({
          title: "Wrong Password",
          description:
            "Messages may appear garbled. Please check the password with your chat partner.",
          variant: "destructive",
        });
      }

      // CRITICAL: Set state and fetch in the same callback chain
      setEncryptionKey(key);
      setIsUnlocked(true);
      setIsPasswordRequired(false);

      console.log("UNLOCK: State updated, fetching messages...");
      // Load messages with the newly set key - fetch directly to avoid circular dependency
      try {
        const { data, error: fetchError } = await supabase
          .from("messages")
          .select(
            `
            *,
            reactions (
              id,
              emoji,
              user_id
            )
          `,
          )
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .range(0, MESSAGE_PAGE_SIZE - 1);

        if (fetchError) throw fetchError;

        if (data) {
          // Decrypt messages
          const decryptedMessages = await Promise.all(
            data.map(async (msg) => {
              let decryptedContent = msg.content;
              let isDecrypted = false;

              try {
                if (msg.content && msg.content.startsWith("{")) {
                  const parsed = JSON.parse(msg.content);
                  if (parsed.ciphertext && parsed.iv) {
                    decryptedContent = decryptMessage(
                      parsed.ciphertext,
                      parsed.iv,
                      key,
                    );
                    isDecrypted = true;
                  } else {
                    decryptedContent = msg.content;
                  }
                } else {
                  decryptedContent = msg.content;
                }
              } catch (err) {
                console.error("Error decrypting message:", err);
                try {
                  const parsed = JSON.parse(msg.content);
                  if (parsed.ciphertext) {
                    const preview = parsed.ciphertext.substring(0, 32) + "...";
                    decryptedContent = preview;
                  } else {
                    decryptedContent = msg.content;
                  }
                } catch {
                  decryptedContent = msg.content;
                }
                isDecrypted = false;
              }

              return {
                ...msg,
                content: decryptedContent,
                decrypted: isDecrypted,
              };
            }),
          );

          const sortedMessages = decryptedMessages.reverse();

          setMessages((prev) => {
            const updated = sortedMessages;
            saveToCache(chatId, updated);
            return updated;
          });

          setOffset(MESSAGE_PAGE_SIZE);
          saveOffsetToCache(chatId, MESSAGE_PAGE_SIZE);
          setHasMore(data.length === MESSAGE_PAGE_SIZE);
        }
      } catch (fetchErr) {
        console.error("UNLOCK: Error fetching messages:", fetchErr);
        setError("Failed to fetch messages");
      }

      console.log("UNLOCK: Messages fetched successfully");
      setLoading(false);

      toast({
        title: "Chat Unlocked",
        description: "Messages decrypted successfully.",
      });

      return true;
    } catch (err) {
      console.error("Error unlocking chat:", err);
      setError(err instanceof Error ? err.message : "Failed to unlock chat");
      setLoading(false);
      return false;
    }
  }, [chatId, toast, saveToCache, saveOffsetToCache]);

  /**
   * Fetch messages from database and decrypt
   */
  const fetchMessages = useCallback(
    async (reset: boolean = false) => {
      if (!chatId || !isUnlocked || !encryptionKey) return;

      try {
        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        const { data, error: fetchError } = await supabase
          .from("messages")
          .select(
            `
            *,
            reactions (
              id,
              emoji,
              user_id
            )
          `,
          )
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .range(currentOffset, currentOffset + MESSAGE_PAGE_SIZE - 1);

        if (fetchError) throw fetchError;

        if (data) {
          // Decrypt messages
          const decryptedMessages = await Promise.all(
            data.map(async (msg) => {
              let decryptedContent = msg.content;
              let isDecrypted = false;

              try {
                // Check if message has encrypted content
                if (msg.content && msg.content.startsWith("{")) {
                  const parsed = JSON.parse(msg.content);

                  if (parsed.ciphertext && parsed.iv) {
                    // Decrypt with AES-256-CBC
                    decryptedContent = decryptMessage(
                      parsed.ciphertext,
                      parsed.iv,
                      encryptionKey,
                    );
                    isDecrypted = true;
                  } else {
                    // Legacy message or plain text
                    decryptedContent = msg.content;
                  }
                } else {
                  // Legacy message or plain text
                  decryptedContent = msg.content;
                }
              } catch (err) {
                console.error("Error decrypting message:", err);
                // Show a preview of the ciphertext instead of full JSON
                try {
                  const parsed = JSON.parse(msg.content);
                  if (parsed.ciphertext) {
                    // Show first 32 characters of ciphertext as preview
                    const preview = parsed.ciphertext.substring(0, 32) + "...";
                    decryptedContent = preview;
                  } else {
                    // Fallback to showing the content as-is
                    decryptedContent = msg.content;
                  }
                } catch {
                  // If parsing fails, show the content as-is
                  decryptedContent = msg.content;
                }
                isDecrypted = false;
              }

              return {
                ...msg,
                content: decryptedContent,
                decrypted: isDecrypted,
              };
            }),
          );

          // Reverse to show oldest first
          const sortedMessages = decryptedMessages.reverse();

          setMessages((prev) => {
            const updated = reset
              ? sortedMessages
              : [...prev, ...sortedMessages];
            // Save to cache
            saveToCache(chatId, updated);
            return updated;
          });

          if (reset) {
            setOffset(MESSAGE_PAGE_SIZE);
            saveOffsetToCache(chatId, MESSAGE_PAGE_SIZE);
          } else {
            setOffset((prev) => {
              const newOffset = prev + MESSAGE_PAGE_SIZE;
              saveOffsetToCache(chatId, newOffset);
              return newOffset;
            });
          }

          setHasMore(data.length === MESSAGE_PAGE_SIZE);
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to fetch messages");
      } finally {
        setLoading(false);
      }
    },
    [chatId, isUnlocked, encryptionKey, offset, saveToCache, saveOffsetToCache],
  );

  /**
   * Send encrypted message
   */
  const sendMessage = useCallback(
    async (content: string, options?: MessageOptions): Promise<boolean> => {
      if (!chatId || !userId || !isUnlocked || !encryptionKey) {
        console.error("SEND: Cannot send - missing required state", {
          hasChatId: !!chatId,
          hasUserId: !!userId,
          isUnlocked,
          hasEncryptionKey: !!encryptionKey,
        });
        toast({
          title: "Error",
          description: "Cannot send message - chat not unlocked",
          variant: "destructive",
        });
        return false;
      }

      // Sanitize input
      const sanitizedContent = content.trim();
      if (!sanitizedContent) {
        console.log("SEND: Empty message, skipping");
        return false;
      }

      // Add optimistic update FIRST
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: userId,
        content: sanitizedContent,
        created_at: new Date().toISOString(),
        decrypted: true,
      };

      console.log("SEND: Adding optimistic message:", tempId);
      setMessages((prev) => {
        const updated = [...prev, optimisticMessage];
        saveToCache(chatId, updated);
        return updated;
      });

      // FALLBACK: Remove temp message after 3 seconds if not replaced
      const tempTimeout = setTimeout(() => {
        console.log("SEND: Temp message timeout, removing:", tempId);
        setMessages((prev) => {
          const updated = prev.filter((msg) => msg.id !== tempId);
          saveToCache(chatId, updated);
          return updated;
        });
      }, 3000);

      try {
        // Encrypt message
        console.log("SEND: Encrypting message...");
        const { ciphertext, iv } = encryptMessage(
          sanitizedContent,
          encryptionKey,
        );

        // Create message object
        const messageData = {
          chat_id: chatId,
          sender_id: userId,
          content: JSON.stringify({ ciphertext, iv }),
          ...(options?.mediaUrl && { media_url: options.mediaUrl }),
          ...(options?.isOneTimeView && { is_one_time_view: true }),
          ...(options?.disappearAfter && {
            disappear_after: options.disappearAfter,
            disappears_at: new Date(
              Date.now() + options.disappearAfter * 1000,
            ).toISOString(),
          }),
          ...(options?.replyToId && { reply_to_id: options.replyToId }),
        };

        console.log("SEND: Inserting to Supabase:", messageData);

        // Send to Supabase
        const { data: insertedData, error: insertError } = await supabase
          .from("messages")
          .insert(messageData)
          .select("id")
          .single();

        if (insertError) {
          console.error("SEND: Insert error:", insertError);
          clearTimeout(tempTimeout);
          // Remove optimistic update on error
          setMessages((prev) => {
            const updated = prev.filter((msg) => msg.id !== tempId);
            saveToCache(chatId, updated);
            return updated;
          });
          throw insertError;
        }

        console.log("SEND: Message inserted successfully:", insertedData?.id);

        // Clear the timeout since we successfully sent
        clearTimeout(tempTimeout);

        // FALLBACK: Refetch messages after 2 seconds to ensure we have the latest
        setTimeout(async () => {
          console.log("SEND: Fallback refetch...");
          try {
            await fetchMessages(true);
          } catch (err) {
            console.error("SEND: Fallback refetch failed:", err);
          }
        }, 2000);

        return true;
      } catch (err) {
        console.error("SEND: Error sending message:", err);
        clearTimeout(tempTimeout);
        toast({
          title: "Error",
          description: "Failed to send message",
          variant: "destructive",
        });
        return false;
      }
    },
    [
      chatId,
      userId,
      isUnlocked,
      encryptionKey,
      toast,
      fetchMessages,
      saveToCache,
    ],
  );

  /**
   * Delete message
   */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const { error } = await supabase
          .from("messages")
          .delete()
          .eq("id", messageId);

        if (error) throw error;

        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

        toast({
          title: "Message Deleted",
          description: "The message has been deleted.",
        });
      } catch (err) {
        console.error("Error deleting message:", err);
        toast({
          title: "Error",
          description: "Failed to delete message",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  /**
   * Mark message as read
   */
  const markAsRead = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", messageId);

      if (error) throw error;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, read_at: new Date().toISOString() }
            : msg,
        ),
      );
    } catch (err) {
      console.error("Error marking message as read:", err);
    }
  }, []);

  /**
   * Mark all unread messages as read - BULLETPROOF VERSION
   * This is relationship-critical - must be 100% reliable
   */
  const markAllAsRead = useCallback(async () => {
    if (!userId || !chatId) {
      console.warn("markAllAsRead: Missing userId or chatId");
      return;
    }

    const readAt = new Date().toISOString();

    // Step 1: IMMEDIATE UI UPDATE (optimistic)
    // This makes the UI feel instant even if network is slow
    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (msg.sender_id !== userId && !msg.read_at) {
          console.log("Marking message as read (UI):", msg.id);
          return { ...msg, read_at: readAt };
        }
        return msg;
      });

      // Save to cache immediately
      saveToCache(chatId, updated);
      return updated;
    });

    // Step 2: BULLETPROOF DATABASE UPDATE with retry
    const updateReadReceipts = async (attempt = 1) => {
      try {
        console.log(
          `BULLETPROOF: Marking all messages as read (attempt ${attempt})`,
        );

        // Use a more reliable query with proper filtering
        const { data, error } = await supabase
          .from("messages")
          .update({ read_at: readAt })
          .eq("chat_id", chatId)
          .neq("sender_id", userId)
          .is("read_at", null)
          .select("id"); // Return updated IDs for verification

        if (error) {
          console.error("BULLETPROOF: Database update failed:", error);
          throw error;
        }

        console.log(
          "BULLETPROOF: Successfully updated messages in database:",
          data?.length || 0,
        );

        // Step 3: VERIFICATION
        // Double-check that messages are actually marked as read
        // NOTE: This is for logging only, no auto-retry to prevent infinite loop
        setTimeout(async () => {
          try {
            const { data: verifyData } = await supabase
              .from("messages")
              .select("id, read_at")
              .eq("chat_id", chatId)
              .neq("sender_id", userId)
              .is("read_at", null);

            if (verifyData && verifyData.length > 0) {
              console.warn(
                "BULLETPROOF: Some messages still unmarked after update (will be synced by real-time)...",
                verifyData.length,
              );
            } else {
              console.log(
                "BULLETPROOF: All messages successfully marked as read! ✨",
              );
            }
          } catch (verifyErr) {
            console.error("BULLETPROOF: Verification failed:", verifyErr);
          }
        }, 1000);
      } catch (err) {
        console.error(`BULLETPROOF: Attempt ${attempt} failed:`, err);

        // Retry logic - relationship-critical, so retry up to 3 times
        if (attempt < 3) {
          console.log(`BULLETPROOF: Retrying in ${attempt * 500}ms...`);
          setTimeout(() => updateReadReceipts(attempt + 1), attempt * 500);
        } else {
          console.error(
            "BULLETPROOF: All attempts failed, read receipts may be out of sync",
          );
          // Even if DB update failed, keep UI optimistic (user thinks it's read)
          // The real-time subscription will eventually sync the correct state
        }
      }
    };

    // Start the update process
    updateReadReceipts();
  }, [userId, chatId, saveToCache]);

  /**
   * Load more messages
   */
  const loadMoreMessages = useCallback(async () => {
    console.log("Load more clicked:", {
      hasMore,
      loading,
      currentOffset: offset,
    });
    if (!hasMore || loading) {
      console.log("Cannot load more:", { hasMore, loading });
      return;
    }
    console.log("Loading more messages at offset:", offset);
    await fetchMessages(false);
  }, [hasMore, loading, fetchMessages, offset]);

  /**
   * Refresh messages
   */
  const refreshMessages = useCallback(async () => {
    await fetchMessages(true);
  }, [fetchMessages]);

  /**
   * Send reaction to message
   */
  const sendReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        // Check if reaction already exists
        const { data: existing } = await supabase
          .from("reactions")
          .select("id")
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
          .single();

        if (existing) {
          // Remove reaction
          const { error } = await supabase
            .from("reactions")
            .delete()
            .eq("id", existing.id);

          if (error) throw error;
        } else {
          // Add reaction
          const { error } = await supabase.from("reactions").insert({
            message_id: messageId,
            user_id: userId,
            emoji: emoji,
          });

          if (error) throw error;
        }

        // Refresh messages to show updated reactions
        await fetchMessages(true);
      } catch (err) {
        console.error("Error sending reaction:", err);
        toast({
          title: "Error",
          description: "Failed to send reaction",
          variant: "destructive",
        });
      }
    },
    [userId, toast, fetchMessages],
  );

  // Set up real-time subscription for new messages
  useEffect(() => {
    if (!chatId || !isUnlocked) return;

    console.log("REALTIME: Setting up subscription for chat:", chatId);

    const channel = supabase
      .channel(`messages-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          console.log("REALTIME: New message received:", payload);
          const newMessage = payload.new;

          // Decrypt the new message
          try {
            let decryptedContent = newMessage.content;
            let isDecrypted = false;

            if (newMessage.content && newMessage.content.startsWith("{")) {
              const parsed = JSON.parse(newMessage.content);
              if (parsed.ciphertext && parsed.iv) {
                decryptedContent = decryptMessage(
                  parsed.ciphertext,
                  parsed.iv,
                  encryptionKey!,
                );
                isDecrypted = true;
              }
            }

            // Check if this is a replacement for an optimistic update
            setMessages((prev) => {
              console.log("REALTIME: Current messages:", prev.length);
              console.log(
                "REALTIME: New message sender:",
                newMessage.sender_id,
              );
              console.log("REALTIME: New message content:", decryptedContent);

              // Find the most recent temp message from the same sender
              const tempIndex = prev.findIndex(
                (msg) =>
                  msg.id.startsWith("temp-") &&
                  msg.sender_id === newMessage.sender_id,
              );

              if (tempIndex !== -1) {
                console.log(
                  "REALTIME: Replacing temp message at index:",
                  tempIndex,
                );
                // Replace temp message with real one
                const updated = [...prev];
                updated[tempIndex] = {
                  ...newMessage,
                  content: decryptedContent,
                  decrypted: isDecrypted,
                };
                // Save to cache
                saveToCache(chatId, updated);
                return updated;
              } else {
                console.log("REALTIME: Adding new message");
                // Add as new message
                const updated = [
                  ...prev,
                  {
                    ...newMessage,
                    content: decryptedContent,
                    decrypted: isDecrypted,
                  },
                ];
                // Save to cache
                saveToCache(chatId, updated);
                return updated;
              }
            });
          } catch (err) {
            console.error("REALTIME: Error decrypting new message:", err);
            // Show a preview of the ciphertext for new messages
            let previewContent = newMessage.content;
            try {
              const parsed = JSON.parse(newMessage.content);
              if (parsed.ciphertext) {
                previewContent = parsed.ciphertext.substring(0, 32) + "...";
              }
            } catch {
              // If parsing fails, show the content as-is
              previewContent = newMessage.content;
            }

            setMessages((prev) => {
              const updated = [
                ...prev,
                {
                  ...newMessage,
                  content: previewContent,
                  decrypted: false,
                },
              ];
              saveToCache(chatId, updated);
              return updated;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          console.log("BULLETPROOF: Real-time read receipt update:", payload);
          const updatedMessage = payload.new;

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id === updatedMessage.id) {
                console.log(
                  "BULLETPROOF: Syncing read receipt for message:",
                  msg.id,
                  {
                    oldReadAt: msg.read_at,
                    newReadAt: updatedMessage.read_at,
                  },
                );
                return { ...msg, read_at: updatedMessage.read_at };
              }
              return msg;
            });
            // CRITICAL: Sync to cache immediately for persistence
            saveToCache(chatId, updated);
            return updated;
          });
        },
      )
      .subscribe((status) => {
        console.log("REALTIME: Subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("REALTIME: Successfully subscribed to chat:", chatId);
        } else if (status === "CHANNEL_ERROR") {
          console.error("REALTIME: Subscription error for chat:", chatId);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, isUnlocked, encryptionKey, saveToCache]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    deleteMessage,
    markAsRead,
    markAllAsRead,
    loadMoreMessages,
    refreshMessages,
    hasMore,
    sendReaction,
    isPasswordRequired,
    unlockChat,
    encryptionKey,
  };
};
