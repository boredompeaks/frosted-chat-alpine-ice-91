import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  GlassContainer,
  GlassButton,
  TypingIndicator,
} from "@/components/ui/glassmorphism";
import { ArrowLeft, Lock, Phone, Video, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import MessageComponent from "./Message";
import MessageInput from "./MessageInput";
import { useChatData } from "@/hooks/useChatData";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import ChatPasswordPrompt from "@/components/auth/ChatPasswordPrompt";
import { uploadFile } from "@/lib/fileUpload/FileUploadService";
import { ChatSkeleton } from "@/components/ui/skeleton-loader";
import { callService, CallState, CallType } from "@/lib/webrtc/callService";
import { IncomingCallOverlay } from "@/components/webrtc/IncomingCallOverlay";
import { ActiveCallOverlay } from "@/components/webrtc/ActiveCallOverlay";

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
    userId: user?.id || "",
  });

  const [contact, setContact] = useState<Contact | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  // Call State
  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<{ id: string; type: CallType; caller: { id: string; username: string } } | null>(null);
  const [activeCallDetails, setActiveCallDetails] = useState<{
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    type: CallType;
    duration: number;
  } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDurationInterval, setCallDurationInterval] = useState<NodeJS.Timeout | null>(null);

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

  // --- Call Logic Start ---

  useEffect(() => {
    // Listen for call events
    const handleIncomingCall = (data: any) => {
      console.log("Incoming call:", data);
      setIncomingCall(data);
      setCallState("incoming");
    };

    const handleCallStateChange = (state: CallState) => {
      console.log("Call state changed:", state);
      setCallState(state);
      if (state === "connected") {
        setIncomingCall(null);
        // Start duration timer
        const interval = setInterval(() => {
          setActiveCallDetails(prev => prev ? ({ ...prev, duration: prev.duration + 1 }) : null);
        }, 1000);
        setCallDurationInterval(interval);
      } else if (state === "ended" || state === "idle") {
        if (callDurationInterval) clearInterval(callDurationInterval);
        setActiveCallDetails(null);
        setIncomingCall(null);
      }
    };

    const handleStream = (stream: MediaStream) => {
      setActiveCallDetails(prev => prev ? ({ ...prev, remoteStream: stream }) : null);
    };

    callService.on("incoming-call", handleIncomingCall);
    callService.on("state-change", handleCallStateChange);
    callService.on("stream", handleStream);

    return () => {
      callService.off("incoming-call", handleIncomingCall);
      callService.off("state-change", handleCallStateChange);
      callService.off("stream", handleStream);
      if (callDurationInterval) clearInterval(callDurationInterval);
    }
  }, [callDurationInterval]);

  const initiateCall = async (type: CallType) => {
    if (!chatId || !contact) return;

    try {
      setCallState("calling");
      setActiveCallDetails({
        localStream: null,
        remoteStream: null,
        type,
        duration: 0
      });

      await callService.initiateCall(chatId, contact.id, type);

      // Update local stream in state once initialized
      const stream = callService.getLocalStream();
      setActiveCallDetails(prev => prev ? ({ ...prev, localStream: stream }) : null);

    } catch (error) {
      console.error("Failed to start call:", error);
      toast({ title: "Call Failed", description: "Could not start call", variant: "destructive" });
      setCallState("idle");
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    try {
      await callService.answerCall(incomingCall.id);
      setActiveCallDetails({
        localStream: callService.getLocalStream(),
        remoteStream: null,
        type: incomingCall.type,
        duration: 0
      });
    } catch (error) {
      console.error("Error answering call", error);
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    callService.rejectCall(incomingCall.id);
    setIncomingCall(null);
    setCallState("idle");
  };

  const endCall = () => {
    callService.endCall();
    setCallState("idle");
  };

  const toggleMute = () => {
    const muted = callService.toggleMute();
    setIsMuted(muted);
  };

  const toggleVideo = () => {
    const video = callService.toggleVideo();
    setIsVideoEnabled(video);
  };

  const toggleScreenShare = async () => {
    // Mock implementation for now as callService might need updates for this
    setIsScreenSharing(!isScreenSharing);
    toast({ title: "Screen Share", description: "Feature coming soon!" });
  };

  // --- Call Logic End ---

  const handleSendMessage = async (message: string, file: File | null) => {
    if (!user || !chatId) return;

    try {
      let mediaUrl = undefined;

      // If there's a file, upload it using FileUploadService
      if (file) {
        const result = await uploadFile(file, user.id, chatId);

        if (!result.success) {
          toast({
            title: "Upload failed",
            description: result.error || "Failed to upload file",
            variant: "destructive",
          });
          return;
        }

        mediaUrl = result.url;
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
    await supabase
      .from("messages")
      .update({
        media_url: null,
        content: "This media has expired",
      })
      .eq("id", messageId);

    toast({
      title: "Media expired",
      description: "The one-time view media has expired",
    });
  };

  const handlePasswordEntered = async (password: string) => {
    const success = await unlockChat();
    if (success) {
      setShowPasswordPrompt(false);
    }
  };

  if (loading && !messages.length && !isPasswordRequired) {
    return (
      <GlassContainer className="w-full h-full flex items-center justify-center p-0 overflow-hidden bg-black/20 backdrop-blur-xl border-white/10">
        <ChatSkeleton />
      </GlassContainer>
    );
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
    <GlassContainer className="w-full h-full flex flex-col relative rounded-none md:rounded-2xl border-0 md:border border-white/10 shadow-none md:shadow-2xl overflow-hidden bg-black/40 backdrop-blur-xl">
      <ChatPasswordPrompt
        open={showPasswordPrompt}
        onOpenChange={setShowPasswordPrompt}
        chatId={chatId || ""}
        onPasswordEntered={handlePasswordEntered}
      />

      {/* Incoming Call Overlay */}
      {incomingCall && (
        <IncomingCallOverlay
          callerName={incomingCall.caller.username}
          callerAvatar=""
          callType={incomingCall.type}
          onAccept={answerCall}
          onReject={rejectCall}
        />
      )}

      {/* Active Call Overlay */}
      {(callState === "connected" || callState === "calling") && activeCallDetails && (
        <ActiveCallOverlay
          localStream={activeCallDetails.localStream}
          remoteStream={activeCallDetails.remoteStream}
          remoteUserName={contact?.username || "Unknown"}
          callType={activeCallDetails.type}
          callDuration={activeCallDetails.duration}
          isMuted={isMuted}
          isVideoEnabled={isVideoEnabled}
          isScreenSharing={isScreenSharing}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onEndCall={endCall}
        />
      )}

      {/* Header */}
      <div className="flex items-center p-4 border-b border-white/10 bg-white/5 backdrop-blur-md">
        <GlassButton
          size="sm"
          variant="ghost"
          className="mr-2 hover:bg-white/10"
          onClick={() => navigate("/chats")}
        >
          <ArrowLeft size={20} />
        </GlassButton>

        <div className="flex-1 flex items-center">
          {contact ? (
            <>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ice-accent/80 to-ice-dark/80 border border-white/20 flex items-center justify-center text-lg font-medium shadow-lg">
                  {contact.username.charAt(0)}
                </div>
                {contact.status ? (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-black rounded-full"></div>
                ) : null}
              </div>

              <div className="ml-3">
                <h2 className="text-white font-bold tracking-tight">{contact.username}</h2>
                {isOtherUserTyping ? (
                  <p className="text-ice-accent text-xs animate-pulse font-medium">typing...</p>
                ) : (
                  <p className="text-white/50 text-xs">{contact.status || "Online"}</p>
                )}
              </div>
            </>
          ) : (
            <div className="ml-3">
              <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Call Buttons */}
        <div className="flex items-center space-x-1">
          <GlassButton size="icon" variant="ghost" className="rounded-full hover:bg-white/10 text-white/80 hover:text-white" onClick={() => initiateCall('audio')}>
            <Phone size={20} />
          </GlassButton>
          <GlassButton size="icon" variant="ghost" className="rounded-full hover:bg-white/10 text-white/80 hover:text-white" onClick={() => initiateCall('video')}>
            <Video size={20} />
          </GlassButton>
          <GlassButton size="icon" variant="ghost" className="rounded-full hover:bg-white/10 text-white/80 hover:text-white">
            <MoreVertical size={20} />
          </GlassButton>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {isPasswordRequired ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50 animate-in fade-in duration-500">
            <div className="p-6 rounded-full bg-white/5 mb-4">
              <Lock className="w-12 h-12 opacity-50" />
            </div>
            <p className="text-lg font-medium">Encrypted Conversation</p>
            <p className="text-sm mt-1 mb-6">Enter password to unlock messages</p>
            <GlassButton
              className="bg-ice-accent/20 hover:bg-ice-accent/30 border-ice-accent/30 min-w-[120px]"
              onClick={() => setShowPasswordPrompt(true)}
            >
              Unlock
            </GlassButton>
          </div>
        ) : (
          <div className="space-y-6">
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
                  <div className="glass p-2 rounded-lg flex space-x-2 justify-end mb-2 animate-in zoom-in duration-200 origin-bottom-right">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        className="text-xl hover:bg-white/20 p-2 rounded transition-colors"
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
              <div className="message-received w-auto animate-in slide-in-from-left duration-300">
                <TypingIndicator />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="relative z-10 bg-black/20 backdrop-blur-md">
        <MessageInput
          onSendMessage={handleSendMessage}
          onTypingUpdate={updateTypingStatus}
        />
      </div>
    </GlassContainer>
  );
};

export default Conversation;
