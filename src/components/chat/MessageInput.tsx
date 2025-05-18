
import React, { useRef, useState } from 'react';
import { Image, Send } from 'lucide-react';
import { GlassButton, GlassTextarea } from "@/components/ui/glassmorphism";
import { useToast } from "@/hooks/use-toast";

interface MessageInputProps {
  onSendMessage: (content: string, file: File | null) => Promise<void>;
  onTypingUpdate: (isTyping: boolean) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, onTypingUpdate }) => {
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim() && !fileInputRef.current?.files?.length) return;
    
    const file = fileInputRef.current?.files?.[0] || null;
    
    try {
      await onSendMessage(message, file);
      setMessage("");
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    
    // Check file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
  };

  return (
    <div className="p-4 border-t border-white/10">
      <div className="flex items-end space-x-2">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleImageUpload}
        />
        
        <GlassButton
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
        >
          <Image size={20} />
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
