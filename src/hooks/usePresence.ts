import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export type PresenceStatus = "online" | "away" | "offline";

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: Date;
  isTyping: boolean;
  currentChatId?: string;
}

export interface UsePresenceOptions {
  userId: string;
  chatId?: string;
  updateInterval?: number; // milliseconds
  awayTimeout?: number; // milliseconds
}

export interface UsePresenceReturn {
  presence: Map<string, UserPresence>;
  myStatus: PresenceStatus;
  updateStatus: (status: PresenceStatus) => Promise<void>;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  isUserOnline: (userId: string) => boolean;
  isUserTyping: (userId: string, chatId?: string) => boolean;
  getUserPresence: (userId: string) => UserPresence | undefined;
}

const DEFAULT_UPDATE_INTERVAL = 30000; // 30 seconds
const DEFAULT_AWAY_TIMEOUT = 300000; // 5 minutes
const TYPING_TIMEOUT = 3000; // 3 seconds

export const usePresence = ({
  userId,
  chatId,
  updateInterval = DEFAULT_UPDATE_INTERVAL,
  awayTimeout = DEFAULT_AWAY_TIMEOUT,
}: UsePresenceOptions): UsePresenceReturn => {
  const [presence, setPresence] = useState<Map<string, UserPresence>>(new Map());
  const [myStatus, setMyStatus] = useState<PresenceStatus>("online");
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const awayCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update user's presence status in database
   */
  const updatePresenceInDB = useCallback(
    async (status: PresenceStatus) => {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Error updating presence:", error);
        }
      } catch (error) {
        console.error("Error in updatePresenceInDB:", error);
      }
    },
    [userId]
  );

  /**
   * Update status
   */
  const updateStatus = useCallback(
    async (status: PresenceStatus) => {
      setMyStatus(status);
      await updatePresenceInDB(status);

      // Broadcast to presence channel
      if (presenceChannelRef.current) {
        await presenceChannelRef.current.track({
          user_id: userId,
          status,
          last_seen: new Date().toISOString(),
          is_typing: false,
        });
      }
    },
    [userId, updatePresenceInDB]
  );

  /**
   * Setup presence channel
   */
  useEffect(() => {
    if (!userId) return;

    const channelName = chatId ? `presence-chat-${chatId}` : `presence-global`;

    presenceChannelRef.current = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    // Subscribe to presence events
    presenceChannelRef.current
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannelRef.current?.presenceState();
        if (state) {
          const newPresence = new Map<string, UserPresence>();

          Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
            if (presences.length > 0) {
              const latest = presences[0];
              newPresence.set(key, {
                userId: latest.user_id,
                status: latest.status || "offline",
                lastSeen: new Date(latest.last_seen || Date.now()),
                isTyping: latest.is_typing || false,
                currentChatId: latest.current_chat_id,
              });
            }
          });

          setPresence(newPresence);
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (newPresences.length > 0) {
          const presence = newPresences[0];
          setPresence((prev) => {
            const updated = new Map(prev);
            updated.set(key, {
              userId: presence.user_id,
              status: presence.status || "online",
              lastSeen: new Date(presence.last_seen || Date.now()),
              isTyping: presence.is_typing || false,
              currentChatId: presence.current_chat_id,
            });
            return updated;
          });
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        if (leftPresences.length > 0) {
          const presence = leftPresences[0];
          setPresence((prev) => {
            const updated = new Map(prev);
            updated.set(key, {
              userId: presence.user_id,
              status: "offline",
              lastSeen: new Date(),
              isTyping: false,
            });
            return updated;
          });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track initial presence
          await presenceChannelRef.current?.track({
            user_id: userId,
            status: myStatus,
            last_seen: new Date().toISOString(),
            is_typing: false,
            current_chat_id: chatId,
          });
        }
      });

    return () => {
      presenceChannelRef.current?.untrack();
      presenceChannelRef.current?.unsubscribe();
    };
  }, [userId, chatId, myStatus]);

  /**
   * Start typing indicator
   */
  const startTyping = useCallback(
    (targetChatId: string) => {
      if (!presenceChannelRef.current) return;

      presenceChannelRef.current.track({
        user_id: userId,
        status: myStatus,
        last_seen: new Date().toISOString(),
        is_typing: true,
        current_chat_id: targetChatId,
      });

      // Auto-stop typing after timeout
      const existingTimeout = typingTimeoutRef.current.get(targetChatId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        stopTyping(targetChatId);
      }, TYPING_TIMEOUT);

      typingTimeoutRef.current.set(targetChatId, timeout);
    },
    [userId, myStatus]
  );

  /**
   * Stop typing indicator
   */
  const stopTyping = useCallback(
    (targetChatId: string) => {
      if (!presenceChannelRef.current) return;

      presenceChannelRef.current.track({
        user_id: userId,
        status: myStatus,
        last_seen: new Date().toISOString(),
        is_typing: false,
        current_chat_id: targetChatId,
      });

      const timeout = typingTimeoutRef.current.get(targetChatId);
      if (timeout) {
        clearTimeout(timeout);
        typingTimeoutRef.current.delete(targetChatId);
      }
    },
    [userId, myStatus]
  );

  /**
   * Check if user is online
   */
  const isUserOnline = useCallback(
    (targetUserId: string): boolean => {
      const userPresence = presence.get(targetUserId);
      return userPresence?.status === "online";
    },
    [presence]
  );

  /**
   * Check if user is typing
   */
  const isUserTyping = useCallback(
    (targetUserId: string, targetChatId?: string): boolean => {
      const userPresence = presence.get(targetUserId);
      if (!userPresence?.isTyping) return false;
      if (targetChatId && userPresence.currentChatId !== targetChatId) {
        return false;
      }
      return true;
    },
    [presence]
  );

  /**
   * Get user presence
   */
  const getUserPresence = useCallback(
    (targetUserId: string): UserPresence | undefined => {
      return presence.get(targetUserId);
    },
    [presence]
  );

  /**
   * Heartbeat to keep presence alive
   */
  useEffect(() => {
    if (!userId) return;

    heartbeatIntervalRef.current = setInterval(async () => {
      if (myStatus !== "offline") {
        await updatePresenceInDB(myStatus);

        if (presenceChannelRef.current) {
          await presenceChannelRef.current.track({
            user_id: userId,
            status: myStatus,
            last_seen: new Date().toISOString(),
            is_typing: false,
            current_chat_id: chatId,
          });
        }
      }
    }, updateInterval);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [userId, myStatus, chatId, updateInterval, updatePresenceInDB]);

  /**
   * Track user activity for auto-away
   */
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (myStatus === "away") {
        updateStatus("online");
      }
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [myStatus, updateStatus]);

  /**
   * Auto-away checker
   */
  useEffect(() => {
    if (!userId) return;

    awayCheckIntervalRef.current = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;

      if (timeSinceActivity > awayTimeout && myStatus === "online") {
        updateStatus("away");
      }
    }, 60000); // Check every minute

    return () => {
      if (awayCheckIntervalRef.current) {
        clearInterval(awayCheckIntervalRef.current);
      }
    };
  }, [userId, myStatus, awayTimeout, updateStatus]);

  /**
   * Handle visibility change (tab switching)
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, mark as away after some time
        setTimeout(() => {
          if (document.hidden && myStatus === "online") {
            updateStatus("away");
          }
        }, 60000); // 1 minute
      } else {
        // Tab is visible, mark as online
        if (myStatus === "away") {
          updateStatus("online");
        }
        lastActivityRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [myStatus, updateStatus]);

  /**
   * Cleanup on unmount - mark as offline
   */
  useEffect(() => {
    return () => {
      updatePresenceInDB("offline");

      // Clear all typing timeouts
      typingTimeoutRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      typingTimeoutRef.current.clear();
    };
  }, [updatePresenceInDB]);

  return {
    presence,
    myStatus,
    updateStatus,
    startTyping,
    stopTyping,
    isUserOnline,
    isUserTyping,
    getUserPresence,
  };
};
