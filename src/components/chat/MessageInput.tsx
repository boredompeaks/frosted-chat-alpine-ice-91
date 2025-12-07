
import React, { useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { GlassButton, GlassTextarea } from "@/components/ui/glassmorphism";
import { useToast } from "@/hooks/use-toast";
import { validateFile, getFileTypeDisplay } from "@/lib/fileUpload/FileUploadService";

interface MessageInputProps {
  onSendMessage: (content: string, file: File | null) => Promise<void>;
  onTypingUpdate: (isTyping: boolean) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, onTypingUpdate }) => {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim() && !selectedFile) return;

    try {
      await onSendMessage(message, selectedFile);
      setMessage("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Clear typing status
      onTypingUpdate(false);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      // Update typing status when user is typing
      onTypingUpdate(true);

      // Clear typing status after a delay
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => onTypingUpdate(false), 3000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file using FileUploadService
    const validation = validateFile(file);
    if (!validation.valid) {
      toast({
        title: "Invalid file",
        description: validation.error,
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // File is valid, set it for sending
    setSelectedFile(file);
    toast({
      title: `${getFileTypeDisplay(file.type)} selected`,
      description: `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
    });
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-4 border-t border-white/10">
      {selectedFile && (
        <div className="mb-2 p-2 rounded-lg bg-white/5 flex items-center justify-between">
          <span className="text-sm text-white/70 truncate">
            📎 {selectedFile.name}
          </span>
          <button
            onClick={clearSelectedFile}
            className="text-white/50 hover:text-white/80 text-sm ml-2"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end space-x-2">
        <input
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />

        <GlassButton
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={20} />
        </GlassButton>

        <GlassTextarea
          placeholder="Type a secure message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="flex-1 max-h-20"
        />

        <GlassButton
          disabled={!message.trim() && (!fileInputRef.current || !fileInputRef.current.files?.length)}
          onClick={handleSend}
          className="bg-ice-accent/20 hover:bg-ice-accent/40"
        >
          <Send size={20} />
        </GlassButton>
      </div>
    </div>
  );
};

export default MessageInput;
