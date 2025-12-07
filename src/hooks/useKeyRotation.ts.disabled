import { useState, useEffect, useCallback, useRef } from "react";
import {
  checkKeyRotation,
  rotateKey,
  updateKeyStatus,
  getChatKey,
  KEY_ROTATION_INTERVAL,
} from "@/lib/encryption/keyManagement";
import { useToast } from "./use-toast";

export interface UseKeyRotationOptions {
  chatId: string;
  userId: string;
  recipientId: string;
  recipientPublicKey: string;
  enabled?: boolean;
  onRotationComplete?: (newKey: string) => void;
  onRotationError?: (error: Error) => void;
}

export interface UseKeyRotationReturn {
  isRotating: boolean;
  lastRotation: Date | null;
  nextRotation: Date | null;
  currentKey: string | null;
  manualRotate: () => Promise<void>;
  checkRotationStatus: () => Promise<boolean>;
}

export const useKeyRotation = ({
  chatId,
  userId,
  recipientId,
  recipientPublicKey,
  enabled = true,
  onRotationComplete,
  onRotationError,
}: UseKeyRotationOptions): UseKeyRotationReturn => {
  const [isRotating, setIsRotating] = useState(false);
  const [lastRotation, setLastRotation] = useState<Date | null>(null);
  const [nextRotation, setNextRotation] = useState<Date | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const rotationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  /**
   * Initialize rotation tracking
   */
  useEffect(() => {
    const initializeRotationTracking = async () => {
      try {
        const key = await getChatKey(chatId);
        setCurrentKey(key);

        // Calculate next rotation time
        const now = new Date();
        const next = new Date(now.getTime() + KEY_ROTATION_INTERVAL);
        setNextRotation(next);
      } catch (error) {
        console.error("Error initializing rotation tracking:", error);
      }
    };

    if (chatId && enabled) {
      initializeRotationTracking();
    }
  }, [chatId, enabled]);

  /**
   * Check if rotation is needed
   */
  const checkRotationStatus = useCallback(async (): Promise<boolean> => {
    try {
      const needsRotation = await checkKeyRotation(chatId);
      return needsRotation;
    } catch (error) {
      console.error("Error checking rotation status:", error);
      return false;
    }
  }, [chatId]);

  /**
   * Perform key rotation
   */
  const performRotation = useCallback(async () => {
    if (isRotating || !recipientPublicKey) return;

    try {
      setIsRotating(true);
      console.log(`Starting key rotation for chat ${chatId}`);

      // Perform rotation
      const newKey = await rotateKey(
        chatId,
        userId,
        recipientId,
        recipientPublicKey
      );

      if (!newKey) {
        throw new Error("Failed to rotate key");
      }

      // Update state
      setCurrentKey(newKey);
      setLastRotation(new Date());

      const nextRotationTime = new Date(Date.now() + KEY_ROTATION_INTERVAL);
      setNextRotation(nextRotationTime);

      // Notify success
      if (onRotationComplete) {
        onRotationComplete(newKey);
      }

      console.log("Key rotation completed successfully");
    } catch (error: any) {
      console.error("Error during key rotation:", error);

      toast({
        title: "Key rotation failed",
        description: "Failed to rotate encryption key. Messages remain secure with current key.",
        variant: "destructive",
      });

      if (onRotationError) {
        onRotationError(error);
      }
    } finally {
      setIsRotating(false);
    }
  }, [
    chatId,
    userId,
    recipientId,
    recipientPublicKey,
    isRotating,
    onRotationComplete,
    onRotationError,
    toast,
  ]);

  /**
   * Manual rotation trigger
   */
  const manualRotate = useCallback(async () => {
    await performRotation();
  }, [performRotation]);

  /**
   * Setup automatic rotation interval
   */
  useEffect(() => {
    if (!enabled || !chatId || !userId || !recipientId || !recipientPublicKey) {
      return;
    }

    const startAutoRotation = async () => {
      // Check immediately if rotation is needed
      const needsRotation = await checkRotationStatus();
      if (needsRotation) {
        await performRotation();
      }

      // Setup interval for periodic checks
      rotationIntervalRef.current = setInterval(async () => {
        const needsRotation = await checkRotationStatus();
        if (needsRotation) {
          await performRotation();
        }
      }, KEY_ROTATION_INTERVAL);
    };

    startAutoRotation();

    // Cleanup on unmount
    return () => {
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
    };
  }, [
    enabled,
    chatId,
    userId,
    recipientId,
    recipientPublicKey,
    checkRotationStatus,
    performRotation,
  ]);

  /**
   * Listen for rotation events from other users
   */
  useEffect(() => {
    if (!chatId || !enabled) return;

    const checkForKeyUpdates = setInterval(async () => {
      try {
        const latestKey = await getChatKey(chatId);
        if (latestKey && latestKey !== currentKey) {
          console.log("Key updated by peer");
          setCurrentKey(latestKey);
          setLastRotation(new Date());

          const nextRotationTime = new Date(Date.now() + KEY_ROTATION_INTERVAL);
          setNextRotation(nextRotationTime);

          toast({
            title: "Encryption key updated",
            description: "Your chat key has been rotated for enhanced security.",
          });
        }
      } catch (error) {
        console.error("Error checking for key updates:", error);
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(checkForKeyUpdates);
    };
  }, [chatId, currentKey, enabled, toast]);

  return {
    isRotating,
    lastRotation,
    nextRotation,
    currentKey,
    manualRotate,
    checkRotationStatus,
  };
};
