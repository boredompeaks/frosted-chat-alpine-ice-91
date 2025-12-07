import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NetworkStatusProps {
  onStatusChange?: (isOnline: boolean) => void;
  showToast?: boolean;
  autoReconnect?: boolean;
  maxRetries?: number;
  retryInterval?: number;
  className?: string;
  position?: "top" | "bottom" | "inline";
  variant?: "banner" | "badge" | "dot";
  enableAnalytics?: boolean;
}

interface NetworkState {
  isOnline: boolean;
  wasOnline: boolean;
  connectionType: string;
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  retryCount: number;
  lastCheck: Date | null;
  error: string | null;
}

const NetworkStatus: React.FC<NetworkStatusProps> = ({
  onStatusChange,
  showToast = false,
  autoReconnect = true,
  maxRetries = 5,
  retryInterval = 3000,
  className = "",
  position = "top",
  variant = "banner",
  enableAnalytics = true,
}) => {
  const [state, setState] = useState<NetworkState>({
    isOnline: navigator.onLine,
    wasOnline: navigator.onLine,
    connectionType: "unknown",
    effectiveType: "unknown",
    downlink: 0,
    rtt: 0,
    saveData: false,
    retryCount: 0,
    lastCheck: null,
    error: null,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckRef = useRef<boolean>(false);
  const { toast } = useToast();

  // Update network information
  const updateNetworkInfo = useCallback(() => {
    const connection = (navigator as any).connection ||
                      (navigator as any).mozConnection ||
                      (navigator as any).webkitConnection;

    if (connection) {
      setState(prev => ({
        ...prev,
        connectionType: connection.type || "unknown",
        effectiveType: connection.effectiveType || "unknown",
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
        saveData: connection.saveData || false,
        lastCheck: new Date(),
      }));
    }
  }, []);

  // Check network connectivity
  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (healthCheckRef.current) return state.isOnline;

    healthCheckRef.current = true;

    try {
      // Multiple strategies for checking connectivity
      const checks = [
        // Check if navigator is online
        navigator.onLine,

        // Check if we can reach a reliable endpoint
        fetch("/api/health", {
          method: "HEAD",
          cache: "no-store",
          mode: "no-cors"
        }).catch(() => false),

        // Check if we can reach a reliable external service
        fetch("https://www.google.com/favicon.ico", {
          method: "HEAD",
          cache: "no-store",
          mode: "no-cors"
        }).catch(() => false)
      ];

      // Wait for at least one check to complete
      const results = await Promise.allSettled(checks);
      const isConnected = results.some(result =>
        result.status === "fulfilled" && result.value !== false
      );

      setState(prev => ({
        ...prev,
        isOnline: isConnected,
        lastCheck: new Date(),
        error: isConnected ? null : "Network connectivity check failed",
      }));

      return isConnected;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isOnline: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : "Unknown network error",
      }));

      return false;
    } finally {
      healthCheckRef.current = false;
    }
  }, [state.isOnline]);

  // Manual retry function
  const handleRetry = useCallback(async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    setState(prev => ({ ...prev, retryCount: prev.retryCount + 1 }));

    try {
      const isConnected = await checkConnectivity();

      if (isConnected) {
        setState(prev => ({
          ...prev,
          isOnline: true,
          wasOnline: true,
          retryCount: 0,
          error: null,
        }));

        if (showToast) {
          toast({
            title: "Connection Restored",
            description: "You're back online!",
            variant: "default",
          });
        }
      } else {
        // Schedule next retry if under max retries
        if (state.retryCount < maxRetries && autoReconnect) {
          retryTimeoutRef.current = setTimeout(() => {
            setIsRetrying(false);
            handleRetry();
          }, retryInterval * Math.pow(1.5, state.retryCount)); // Exponential backoff
        }
      }
    } catch (error) {
      console.error("Network retry failed:", error);
    } finally {
      setIsRetrying(false);
    }
  }, [checkConnectivity, isRetrying, state.retryCount, maxRetries, autoReconnect, retryInterval, showToast, toast]);

  // Auto-retry when connection is restored
  useEffect(() => {
    if (state.isOnline && !state.wasOnline) {
      // Connection restored
      setState(prev => ({
        ...prev,
        wasOnline: true,
        retryCount: 0,
        error: null,
      }));

      if (showToast) {
        toast({
          title: "Back Online",
          description: "Your connection has been restored.",
          variant: "default",
        });
      }
    } else if (!state.isOnline && state.wasOnline) {
      // Connection lost
      setState(prev => ({
        ...prev,
        wasOnline: false,
      }));

      if (showToast) {
        toast({
          title: "Connection Lost",
          description: "You're currently offline. Some features may be limited.",
          variant: "destructive",
        });
      }
    }
  }, [state.isOnline, state.wasOnline, showToast, toast]);

  // Network event listeners
  useEffect(() => {
    const handleOnline = async () => {
      setState(prev => ({ ...prev, isOnline: true }));
      updateNetworkInfo();

      // Verify actual connectivity
      setTimeout(checkConnectivity, 1000);
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        error: "Network connection lost",
      }));
    };

    const handleConnectionChange = () => {
      updateNetworkInfo();
    };

    // Add event listeners
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Connection API for better network info
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener("change", handleConnectionChange);
    }

    // Initial network info
    updateNetworkInfo();

    // Periodic connectivity check
    const periodicCheck = setInterval(() => {
      if (!healthCheckRef.current) {
        checkConnectivity();
      }
    }, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (connection) {
        connection.removeEventListener("change", handleConnectionChange);
      }
      clearInterval(periodicCheck);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [updateNetworkInfo, checkConnectivity]);

  // Notify parent component of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(state.isOnline);
    }
  }, [state.isOnline, onStatusChange]);

  // Analytics tracking
  useEffect(() => {
    if (enableAnalytics && import.meta.env.PROD) {
      // Track network status changes for analytics
      const event = state.isOnline ? "network_online" : "network_offline";

      // In a real app, you would send this to your analytics service
      console.log(`[Analytics] Network status changed: ${event}`, {
        connectionType: state.connectionType,
        effectiveType: state.effectiveType,
        downlink: state.downlink,
        rtt: state.rtt,
        timestamp: new Date().toISOString(),
      });
    }
  }, [state.isOnline, state.connectionType, state.effectiveType, state.downlink, state.rtt, enableAnalytics]);

  // Network quality indicator
  const getNetworkQuality = useCallback(() => {
    if (!state.isOnline) return "offline";

    const { effectiveType, downlink, rtt } = state;

    // Network quality based on effectiveType and metrics
    if (effectiveType === "4g" && downlink > 5 && rtt < 100) return "excellent";
    if (effectiveType === "4g" || (downlink > 2 && rtt < 200)) return "good";
    if (effectiveType === "3g" || (downlink > 0.5 && rtt < 400)) return "fair";
    return "poor";
  }, [state.isOnline, state.effectiveType, state.downlink, state.rtt]);

  const networkQuality = getNetworkQuality();
  const qualityColors = {
    excellent: "text-green-400",
    good: "text-blue-400",
    fair: "text-yellow-400",
    poor: "text-orange-400",
    offline: "text-red-400",
  };

  // Banner variant
  if (variant === "banner" && !state.isOnline) {
    return (
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 bg-red-500/90 backdrop-blur-sm border-b border-red-400/50 ${className}`}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <WifiOff className="h-5 w-5 text-white" />
              <div>
                <p className="text-white font-medium">You're offline</p>
                <p className="text-white/80 text-sm">
                  {state.error || "Check your internet connection"}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {state.retryCount > 0 && (
                <span className="text-white/80 text-sm">
                  Retry {state.retryCount}/{maxRetries}
                </span>
              )}

              <button
                onClick={handleRetry}
                disabled={isRetrying || state.retryCount >= maxRetries}
                className="glass-button px-3 py-1.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRetrying ? "animate-spin" : ""}`} />
                {isRetrying ? "Retrying..." : "Retry"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Badge variant
  if (variant === "badge") {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
          state.isOnline
            ? "bg-green-500/20 text-green-400 border border-green-500/30"
            : "bg-red-500/20 text-red-400 border border-red-500/30"
        }`}>
          {state.isOnline ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          <span>{state.isOnline ? "Online" : "Offline"}</span>
        </div>

        {state.isOnline && state.connectionType !== "unknown" && (
          <div className={`text-xs ${qualityColors[networkQuality]}`}>
            {state.effectiveType.toUpperCase()}
            {state.downlink > 0 && ` (${Math.round(state.downlink)} Mbps)`}
          </div>
        )}
      </div>
    );
  }

  // Dot variant (minimal indicator)
  if (variant === "dot") {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <motion.div
          className={`w-2 h-2 rounded-full ${
            state.isOnline ? "bg-green-400" : "bg-red-400"
          }`}
          animate={state.isOnline ? { opacity: [0.5, 1, 0.5] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-xs text-white/60">
          {state.isOnline ? "Online" : "Offline"}
        </span>
      </div>
    );
  }

  // Inline variant (default)
  return (
    <div className={`glass-card p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            {state.isOnline ? (
              <Wifi className={`h-5 w-5 ${qualityColors[networkQuality]}`} />
            ) : (
              <WifiOff className="h-5 w-5 text-red-400" />
            )}

            {/* Connection quality indicator */}
            {state.isOnline && (
              <motion.div
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-400"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>

          <div>
            <p className={`text-sm font-medium ${
              state.isOnline ? "text-white" : "text-red-400"
            }`}>
              {state.isOnline ? "Connected" : "Disconnected"}
            </p>

            {state.isOnline && state.connectionType !== "unknown" && (
              <div className="flex items-center space-x-2 text-xs text-white/60">
                <span className={qualityColors[networkQuality]}>
                  {state.effectiveType.toUpperCase()}
                </span>
                {state.downlink > 0 && (
                  <span>{Math.round(state.downlink)} Mbps</span>
                )}
                {state.rtt > 0 && (
                  <span>{state.rtt}ms</span>
                )}
              </div>
            )}

            {state.lastCheck && (
              <p className="text-xs text-white/40">
                Last check: {state.lastCheck.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {state.isOnline && (
          <div className={`w-2 h-2 rounded-full ${qualityColors[networkQuality].replace("text-", "bg-")}`} />
        )}
      </div>

      {!state.isOnline && state.retryCount < maxRetries && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full glass-button py-2 text-sm text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Reconnecting..." : `Reconnect (${state.retryCount}/${maxRetries})`}
          </button>
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;</parameter>
