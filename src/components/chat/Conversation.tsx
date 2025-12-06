import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  GlassContainer,
  GlassButton,
  TypingIndicator,
} from "@/components/ui/glassmorphism";
import { ArrowLeft, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { v4 as uuidv4 } from "uuid";
import MessageComponent from "./Message";
import MessageInput from "./MessageInput";
import { useChatData, Message } from "@/hooks/useChatData";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import ChatPasswordPrompt from "@/components/auth/ChatPasswordPrompt";

interface Contact {
  id: string;
  username: string;
  status: string | null;
}

const EMOJIS = ["👍", "❤️", "😊", "😂", "😮", "😢", "🎉"];

const Conversation = () => {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Use advanced features from useChatData hook
  const {
    messages,
    loading,
    error,
    sendMessage: hookSendMessage,
    markAsRead,
    markAllAsRead,
    sendReaction,
    isPasswordRequired,
    unlockChat,
    encryptionKey,
  } = useChatData(chatId || "", user?.id || "");

  // Use presence tracking
  const { isOtherUserTyping, updatePresence } = usePresence({
    chatId: chatId || "",
  });

  const [contact, setContact] = useState<Contact | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(
    null,
  );
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync password prompt state with hook
  useEffect(() => {
    if (isPasswordRequired) {
      setShowPasswordPrompt(true);
    } else {
      setShowPasswordPrompt(false);
    }
  }, [isPasswordRequired]);

  // Fetch contact info
  useEffect(() => {
    if (!chatId || !user) return;

    const fetchContact = async () => {
      try {
        const { data: participants, error: participantsError } = await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("chat_id", chatId)
          .neq("user_id", user.id);

        if (participantsError || !participants || participants.length === 0) {
          console.error("Error fetching participants:", participantsError);
          return;
        }

        const otherUserId = participants[0].user_id;

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, status")
          .eq("id", otherUserId)
          .single();

        if (profileError) {
          console.error("Error fetching contact profile:", profileError);
          return;
        }

        setContact(profileData);
      } catch (error) {
        console.error("Error fetching contact:", error);
      }
    };

    fetchContact();
  }, [chatId, user]);

  // Mark all as read when messages load or change
  useEffect(() => {
    if (messages.length > 0 && user && chatId && !isPasswordRequired) {
      markAllAsRead();
    }
  }, [messages.length, user, chatId, markAllAsRead, isPasswordRequired]);

  // Update typing status wrapper
  const updateTypingStatus = async (isTyping: boolean) => {
    if (updatePresence) {
      updatePresence(isTyping);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, isOtherUserTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (message: string, file: File | null) => {
    if (!user || !chatId) return;

    try {
      let mediaUrl = undefined;

      // If there's a file, upload it to storage
      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Upload image to storage
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(filePath, file);

        if (uploadError) {
          toast({
            title: "Upload failed",
            description: uploadError.message,
            variant: "destructive",
          });
          return;
        }

        // Get public URL
        const { data: urlData } = await supabase.storage
          .from("chat-media")
          .getPublicUrl(filePath);

        if (urlData) {
          mediaUrl = urlData.publicUrl;
        }
      }

      // Send message using the hook
      await hookSendMessage(message, { mediaUrl });
      
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleReaction = async (messageId: string) => {
    setReactingToMessageId(messageId);
    setShowEmojiPicker(true);
  };

  const handleSelectEmoji = async (messageId: string, emoji: string) => {
    try {
      await sendReaction(messageId, emoji);
      setReactingToMessageId(null);
      setShowEmojiPicker(false);
    } catch (error) {
      console.error("Error handling reaction:", error);
    }
  };

  const handleMessageDisappear = async (messageId: string) => {
     // useChatData doesn't expose deleteMessage directly for disappearance logic yet, 
     // but we can implement it or add it to hook. 
     // For now, let's keep the manual delete but it would be better in the hook.
     // Actually useChatData DOES expose deleteMessage.
     // But looking at the code I'm replacing, it used manual delete.
     // Let's use the one from hook if available, otherwise direct call.
     // useChatData has deleteMessage.
     try {
        const { error } = await supabase
          .from("messages")
          .delete()
          .eq("id", messageId);
          
        if (error) throw error;
     } catch (error) {
        console.error("Error deleting disappeared message:", error);
     }
  };

  const handleViewOneTimeMedia = async (messageId: string) => {
    if (!user) return;

    // Mark the media as viewed in database
    await supabase
      .from("messages")
      .update({
        media_url: null,
        content: "This media has expired",
      })
      .eq("id", messageId);

    // The realtime subscription in useChatData should handle the UI update
    toast({
      title: "Media expired",
      description: "The one-time view media has expired",
    });
  };

  const handlePasswordEntered = async (password: string) => {
    // The prompt component calls setChatPassword internally, 
    // so we just need to trigger the unlock in the hook
    const success = await unlockChat();
    if (success) {
      setShowPasswordPrompt(false);
    }
  };

  if (loading && !messages.length && !isPasswordRequired) {
    return (
      <GlassContainer className="w-full max-w-md h-full flex items-center justify-center">
        <p className="text-white">Loading conversation...</p>
      </GlassContainer>
    );
  }

  // If password is required and we are not unlocked
  if (isPasswordRequired) {
     // We will render the prompt.
     // But we also want to show the container behind it maybe?
     // Or just return the prompt if it's blocking.
     // The ChatPasswordPrompt is a Dialog, so it needs to be rendered.
  }

  if (!contact && !loading && !isPasswordRequired) {
    return (
      <GlassContainer className="w-full max-w-md h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-4">Conversation not found</p>
          <GlassButton onClick={() => navigate("/chats")}>
            Back to Chats
          </GlassButton>
        </div>
      </GlassContainer>
    );
  }

  return (
    <GlassContainer className="w-full max-w-md h-full max-h-[90vh] flex flex-col relative">
      <ChatPasswordPrompt 
        open={showPasswordPrompt} 
        onOpenChange={setShowPasswordPrompt}
        chatId={chatId || ""}
        onPasswordEntered={handlePasswordEntered}
      />

      {/* Header */}
      <div className="flex items-center p-4 border-b border-white/10">
        <GlassButton
          size="sm"
          variant="ghost"
          className="mr-2"
          onClick={() => navigate("/chats")}
        >
          <ArrowLeft size={20} />
        </GlassButton>

        <div className="flex-1">
          <div className="flex items-center">
             {contact ? (
               <>
                <div className="w-10 h-10 rounded-full bg-ice-dark/50 border border-ice-accent/30 flex items-center justify-center text-lg font-medium">
                  {contact.username.charAt(0)}
                </div>

                <div className="ml-3">
                  <h2 className="text-white font-medium">{contact.username}</h2>
                  {isOtherUserTyping ? (
                    <p className="text-ice-accent text-xs">typing...</p>
                  ) : contact.status ? (
                    <p className="text-ice-accent text-xs truncate">
                      {contact.status}
                    </p>
                  ) : (
                    <p className="text-white/60 text-xs">Online</p>
                  )}
                </div>
               </>
             ) : (
               <div className="ml-3">
                  <h2 className="text-white font-medium">Loading...</h2>
               </div>
             )}
          </div>
        </div>
        
        {/* Encryption Status Icon */}
        <div className="text-ice-accent/50">
           <Lock size={16} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isPasswordRequired ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50">
            <Lock className="w-12 h-12 mb-4 opacity-50" />
            <p>This chat is encrypted.</p>
            <p className="text-sm">Please enter password to unlock.</p>
            <GlassButton 
              className="mt-4"
              onClick={() => setShowPasswordPrompt(true)}
            >
              Enter Password
            </GlassButton>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <MessageComponent
                  {...msg}
                  currentUserId={user?.id}
                  onReaction={handleReaction}
                  onDisappear={handleMessageDisappear}
                  onViewOneTimeMedia={handleViewOneTimeMedia}
                />

                {reactingToMessageId === msg.id && showEmojiPicker && (
                  <div className="glass p-2 rounded-lg flex space-x-2 justify-end mb-2">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        className="text-lg hover:bg-white/10 p-1 rounded"
                        onClick={() => handleSelectEmoji(msg.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}

            {isOtherUserTyping && (
              <div className="message-received w-auto">
                <TypingIndicator />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onTypingUpdate={updateTypingStatus}
        disabled={isPasswordRequired}
      />
    </GlassContainer>
  );
};

export default Conversation;
