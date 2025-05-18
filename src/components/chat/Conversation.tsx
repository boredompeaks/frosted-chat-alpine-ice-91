
import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GlassContainer, GlassButton, TypingIndicator } from "@/components/ui/glassmorphism";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { v4 as uuidv4 } from "uuid";
import Message from "./Message";
import MessageInput from "./MessageInput";

interface MessageType {
  id: string;
  content: string | null;
  sender_id: string | null;
  chat_id: string | null;
  created_at: string | null;
  read_at: string | null;
  disappear_after: number | null;
  is_one_time_view: boolean | null;
  media_url: string | null;
}

interface Reaction {
  id: string;
  message_id: string | null;
  user_id: string | null;
  emoji: string;
  created_at: string | null;
}

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
  
  const [messages, setMessages] = useState<(MessageType & { reactions?: Reaction[] })[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!chatId || !user) return;
    
    // Fetch messages and reactions
    const fetchMessages = async () => {
      try {
        setLoading(true);
        
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true });
          
        if (messagesError) {
          console.error("Error fetching messages:", messagesError);
          return;
        }
        
        // Fetch reactions for all messages
        const { data: reactionsData, error: reactionsError } = await supabase
          .from("reactions")
          .select("*")
          .in("message_id", messagesData?.map(m => m.id) || []);
          
        if (reactionsError) {
          console.error("Error fetching reactions:", reactionsError);
        }
        
        // Combine messages with their reactions
        const messagesWithReactions = messagesData.map(msg => {
          const messageReactions = reactionsData?.filter(r => r.message_id === msg.id) || [];
          return {
            ...msg,
            reactions: messageReactions.length > 0 ? messageReactions : undefined
          };
        });
        
        setMessages(messagesWithReactions || []);
        
        // Mark messages from other users as read
        const unreadMessages = messagesData?.filter(m => 
          m.sender_id !== user.id && m.read_at === null
        );
        
        if (unreadMessages && unreadMessages.length > 0) {
          for (const msg of unreadMessages) {
            await supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", msg.id);
          }
        }
      } catch (error) {
        console.error("Error in fetchMessages:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Get the other user in this chat
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
    
    fetchMessages();
    fetchContact();
    
    // Set up real-time subscriptions
    setupRealtimeSubscriptions(chatId, user.id);
    
    return () => {
      cleanupRealtimeSubscriptions(chatId);
    };
  }, [chatId, user]);

  // Extract real-time subscriptions to a separate function for clarity
  const setupRealtimeSubscriptions = (chatId: string, userId: string) => {
    // Set up real-time subscription for new messages
    const messageChannel = supabase
      .channel(`chat:${chatId}:messages`)
      .on('postgres_changes', 
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        }, 
        (payload) => {
          const newMessage = payload.new as MessageType;
          
          // Mark as read if from other user
          if (newMessage.sender_id !== userId && newMessage.read_at === null) {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMessage.id);
          }
          
          setMessages(prev => [...prev, { ...newMessage, reactions: [] }]);
        }
      )
      .subscribe();
      
    // Set up real-time subscription for reactions
    const reactionChannel = supabase
      .channel(`chat:${chatId}:reactions`)
      .on('postgres_changes', 
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reactions'
        }, 
        (payload) => {
          const newReaction = payload.new as Reaction;
          
          setMessages(prev => prev.map(msg => {
            if (msg.id === newReaction.message_id) {
              return {
                ...msg,
                reactions: [...(msg.reactions || []), newReaction]
              };
            }
            return msg;
          }));
        }
      )
      .subscribe();
      
    // Presence channel for typing indicators
    const presenceChannel = supabase.channel(`presence:${chatId}`);

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState();
        
        // Check if the other user is typing
        const otherUserPresence = Object.values(presenceState)
          .flat()
          .find((p: any) => p.user_id !== userId && p.is_typing);
          
        setIsTyping(!!otherUserPresence);
      })
      .subscribe();
  };

  const cleanupRealtimeSubscriptions = (chatId: string) => {
    supabase.removeChannel(supabase.getChannel(`chat:${chatId}:messages`));
    supabase.removeChannel(supabase.getChannel(`chat:${chatId}:reactions`));
    supabase.removeChannel(supabase.getChannel(`presence:${chatId}`));
  };

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!chatId || !user) return;
    
    try {
      const channel = supabase.channel(`presence:${chatId}`);
      
      await channel.track({
        user_id: user.id,
        is_typing: isTyping,
        username: contact?.username || "User"
      });
    } catch (error) {
      console.error("Error updating typing status:", error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (message: string, file: File | null) => {
    if (!user || !chatId) return;
    
    try {
      let mediaUrl = null;
      
      // If there's a file, upload it to storage
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        
        // Upload image to storage
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
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
          .from('chat-media')
          .getPublicUrl(filePath);
          
        if (urlData) {
          mediaUrl = urlData.publicUrl;
        }
      }
      
      // Create message in database
      await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          content: message.trim() || null,
          sender_id: user.id,
          media_url: mediaUrl,
        });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleReaction = async (messageId: string) => {
    setReactingToMessageId(messageId);
    setShowEmojiPicker(true);
  };

  const handleSelectEmoji = async (messageId: string, emoji: string) => {
    if (!user) return;
    
    try {
      // Check if this reaction already exists
      const { data: existingReaction, error: existingError } = await supabase
        .from("reactions")
        .select("*")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();
        
      if (existingError) {
        console.error("Error checking reaction:", existingError);
        return;
      }
      
      if (existingReaction) {
        // Remove the reaction
        await supabase
          .from("reactions")
          .delete()
          .eq("id", existingReaction.id);
          
        // Update UI
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === messageId && msg.reactions) {
              return {
                ...msg,
                reactions: msg.reactions.filter(r => r.id !== existingReaction.id)
              };
            }
            return msg;
          })
        );
      } else {
        // Add the reaction
        await supabase
          .from("reactions")
          .insert({
            message_id: messageId,
            user_id: user.id,
            emoji
          });
      }
    } catch (error) {
      console.error("Error handling reaction:", error);
    }
    
    setReactingToMessageId(null);
    setShowEmojiPicker(false);
  };

  const handleMessageDisappear = async (messageId: string) => {
    try {
      // Delete the message from the database
      await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);
        
      // Update UI
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
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
        content: "This media has expired"
      })
      .eq("id", messageId);
      
    // Update UI
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId
          ? { ...msg, content: "This media has expired", media_url: null }
          : msg
      )
    );
    
    toast({
      title: "Media expired",
      description: "The one-time view media has expired",
    });
  };

  if (loading) {
    return (
      <GlassContainer className="w-full max-w-md h-full flex items-center justify-center">
        <p className="text-white">Loading conversation...</p>
      </GlassContainer>
    );
  }

  if (!contact) {
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
    <GlassContainer className="w-full max-w-md h-full max-h-[90vh] flex flex-col">
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
            <div className="w-10 h-10 rounded-full bg-ice-dark/50 border border-ice-accent/30 flex items-center justify-center text-lg font-medium">
              {contact.username.charAt(0)}
            </div>
            
            <div className="ml-3">
              <h2 className="text-white font-medium">{contact.username}</h2>
              {isTyping ? (
                <p className="text-ice-accent text-xs">typing...</p>
              ) : contact.status ? (
                <p className="text-ice-accent text-xs truncate">{contact.status}</p>
              ) : (
                <p className="text-white/60 text-xs">Online</p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <React.Fragment key={msg.id}>
              <Message
                {...msg}
                currentUserId={user?.id}
                onReaction={handleReaction}
                onDisappear={handleMessageDisappear}
                onViewOneTimeMedia={handleViewOneTimeMedia}
              />
              
              {reactingToMessageId === msg.id && showEmojiPicker && (
                <div className="glass p-2 rounded-lg flex space-x-2 justify-end mb-2">
                  {EMOJIS.map(emoji => (
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
          
          {isTyping && (
            <div className="message-received w-auto">
              <TypingIndicator />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Message Input */}
      <MessageInput 
        onSendMessage={handleSendMessage}
        onTypingUpdate={updateTypingStatus}
      />
    </GlassContainer>
  );
};

export default Conversation;
