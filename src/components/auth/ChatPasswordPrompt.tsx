import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, Shield, AlertCircle } from "lucide-react";
import { validatePassword, setChatPassword } from "@/lib/simpleE2EE";
import { useTheme } from "@/providers/ThemeProvider";

interface ChatPasswordPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  onPasswordEntered: (password: string) => void;
  isLoading?: boolean;
}

export const ChatPasswordPrompt: React.FC<ChatPasswordPromptProps> = ({
  open,
  onOpenChange,
  chatId,
  onPasswordEntered,
  isLoading = false,
}) => {
  const { theme } = useTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate password
    const validation = validatePassword(password);
    if (!validation.valid) {
      setError(validation.error || "Invalid password");
      return;
    }

    setIsSubmitting(true);

    try {
      // Store password for this chat
      setChatPassword(chatId, password);
      // Call the callback to unlock the chat
      onPasswordEntered(password);
      setPassword("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPassword("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/20 sm:max-w-md p-0 overflow-hidden"
        style={{
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Background Skeleton */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-blue-400 animate-spin"></div>
              <div className="h-4 w-32 bg-white/10 rounded animate-pulse"></div>
              <div className="h-3 w-24 bg-white/5 rounded animate-pulse"></div>
            </div>
          </div>
        )}

        <div className="relative z-10">
          <DialogHeader className="p-6 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="p-2 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/20"
                style={{ background: "rgba(59, 130, 246, 0.1)" }}
              >
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <DialogTitle className="text-white">
                Enter Chat Password
              </DialogTitle>
            </div>
            <DialogDescription className="text-gray-300">
              Enter the password to unlock this encrypted chat.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-gray-300">
                Chat Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter chat password"
                  className="pl-10"
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "white",
                    borderRadius: "8px",
                  }}
                  disabled={isSubmitting || isLoading}
                  autoFocus
                />
              </div>
              {error && (
                <Alert
                  variant="destructive"
                  className="bg-red-500/10 border-red-500/20"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-300">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                className="flex-1 glass-button border-white/10 text-gray-300 hover:bg-white/5"
                disabled={isSubmitting || isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 glass-button bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/30 hover:from-blue-500/30 hover:to-purple-500/30"
                disabled={!password || isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  "Unlock Chat"
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChatPasswordPrompt;
