
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import {
  deriveChatKey,
  encryptMessage,
  decryptMessage,
  getChatPassword,
  getOrPromptPassword,
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
  sendMessage: (content: string, options?: MessageOptions) => Promise<boolean>;
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
   * Fetch messages from database and decrypt
   * DEFINED BEFORE useEffect/initializeChat to resolve dependency issues
   */
  const fetchMessages = useCallback(
    async (reset: boolean = false, keyOverride?: string) => {
      // Use the override key if provided, otherwise fall back to state
      const activeKey = keyOverride || encryptionKey;

      if (!chatId || !isUnlocked || !activeKey) {
        // If we are resetting (initial load) and missing requirements, we must stop loading
        if (reset) setLoading(false);
        return;
      }

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
            data.map(async (msg): Promise<Message> => {
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
                      activeKey,
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
              } as Message;
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

        if (cachedMessages && cachedMessages.length > 0) {
          setMessages(cachedMessages);
          setOffset(cachedOffset);
          setHasMore(cachedOffset > 0);
          setLoading(false);

          // Refresh in background
          setTimeout(() => {
            fetchMessages(true, key).catch((err) => {
              console.error("Background refresh failed:", err);
            });
          }, 100);
        } else {
          // No cache, fetch fresh
          // Pass key explicitly to avoid stale state
          await fetchMessages(true, key);
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
  }, [chatId, userId]);

  /**
   * Unlock chat with password
   */
  const unlockChat = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Get or prompt for password
      const password = await getOrPromptPassword(chatId);

      // Derive encryption key
      const key = deriveChatKey(password, chatId);

      // Test key by trying to decrypt a message (if any exist)
      try {
        const { data: testMessage } = await supabase
          .from("messages")
          .select("content")
          .eq("chat_id", chatId)
          .limit(1)
          .single();

        if (testMessage?.content) {
          const parsed = JSON.parse(testMessage.content);
          if (parsed.ciphertext && parsed.iv) {
            decryptMessage(parsed.ciphertext, parsed.iv, key);
          }
        }
      } catch (decryptError) {
        toast({
          title: "Wrong Password",
          description:
            "Messages may appear garbled. Please check the password with your chat partner.",
          variant: "destructive",
        });
      }

      setEncryptionKey(key);
      setIsUnlocked(true);
      setIsPasswordRequired(false);

      // Pass key explicitly to avoid stale state
      await fetchMessages(true, key);

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
  }, [chatId, toast, fetchMessages]);

  /**
   * Send encrypted message
   */
  const sendMessage = useCallback(
    async (content: string, options?: MessageOptions): Promise<boolean> => {
      if (!chatId || !userId || !isUnlocked || !encryptionKey) {
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

      setMessages((prev) => {
        const updated = [...prev, optimisticMessage];
        saveToCache(chatId, updated);
        return updated;
      });

      // FALLBACK: Remove temp message after 3 seconds if not replaced
      const tempTimeout = setTimeout(() => {
        setMessages((prev) => {
          const updated = prev.filter((msg) => msg.id !== tempId);
          saveToCache(chatId, updated);
          return updated;
        });
      }, 3000);

      try {
        // Encrypt message
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

        // Send to Supabase
        const { data: insertedData, error: insertError } = await supabase
          .from("messages")
          .insert(messageData)
          .select("id")
          .single();

        if (insertError) {
          clearTimeout(tempTimeout);
          // Remove optimistic update on error
          setMessages((prev) => {
            const updated = prev.filter((msg) => msg.id !== tempId);
            saveToCache(chatId, updated);
            return updated;
          });
          throw insertError;
        }

        // Clear the timeout since we successfully sent
        clearTimeout(tempTimeout);

        // FALLBACK: Refetch messages after 2 seconds to ensure we have the latest
        setTimeout(async () => {
          try {
            await fetchMessages(true);
          } catch (err) {

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
   */
  const markAllAsRead = useCallback(async () => {
    if (!userId || !chatId) {
      return;
    }

    const readAt = new Date().toISOString();

    // Step 1: IMMEDIATE UI UPDATE (optimistic)
    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (msg.sender_id !== userId && !msg.read_at) {
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
        const { error } = await supabase
          .from("messages")
          .update({ read_at: readAt })
          .eq("chat_id", chatId)
          .neq("sender_id", userId)
          .is("read_at", null)
          .select("id");

        if (error) {
          throw error;
        }

      } catch (err) {
        // Retry logic - relationship-critical
        if (attempt < 3) {
          setTimeout(() => updateReadReceipts(attempt + 1), attempt * 500);
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
    if (!hasMore || loading) {
      return;
    }
    await fetchMessages(false);
  }, [hasMore, loading, fetchMessages]);

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
          .maybeSingle();

        if (existing) {
          // Remove reaction
          await supabase.from("reactions").delete().eq("id", existing.id);

          setMessages(prev => prev.map(msg => {
            if (msg.id === messageId && msg.reactions) {
              return {
                ...msg,
                reactions: msg.reactions.filter(r => r.id !== existing.id)
              };
            }
            return msg;
          }));
        } else {
          // Add reaction
          const { data, error } = await supabase
            .from("reactions")
            .insert({
              message_id: messageId,
              user_id: userId,
              emoji,
            })
            .select()
            .single();

          if (error) throw error;

          if (data) {
            setMessages(prev => prev.map(msg => {
              if (msg.id === messageId) {
                return {
                  ...msg,
                  reactions: [...(msg.reactions || []), {
                    id: data.id,
                    emoji: data.emoji,
                    user_id: data.user_id
                  }]
                };
              }
              return msg;
            }));
          }
        }
      } catch (err) {
        console.error("Error sending reaction:", err);
      }
    },
    [userId],
  );

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
