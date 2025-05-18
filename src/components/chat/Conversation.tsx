
import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GlassContainer, GlassTextarea, GlassButton, GlassCard, GlassBadge, TypingIndicator, DisappearingMessage } from "@/components/ui/glassmorphism";
import { ArrowLeft, Send, Image, Clock, Check, CheckCheck, Eye, Smile, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { v4 as uuidv4 } from "uuid";

interface Message {
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
  
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<(Message & { reactions?: Reaction[] })[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
          const newMessage = payload.new as Message;
          
          // Mark as read if from other user
          if (newMessage.sender_id !== user.id && newMessage.read_at === null) {
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
          .find((p: any) => p.user_id !== user.id && p.is_typing);
          
        setIsTyping(!!otherUserPresence);
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [chatId, user]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!chatId || !user) return;
    
    const channel = supabase.channel(`presence:${chatId}`);
    
    await channel.track({
      user_id: user.id,
      is_typing: isTyping
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (!message.trim() && !fileInputRef.current?.files?.length) return;
    if (!user || !chatId) return;
    
    // Clear typing status
    updateTypingStatus(false);
    
    try {
      let mediaUrl = null;
      
      // If there's a file, upload it to storage
      if (fileInputRef.current?.files?.length) {
        const file = fileInputRef.current.files[0];
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
      const { data: newMessage, error: messageError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          content: message.trim() || null,
          sender_id: user.id,
          media_url: mediaUrl,
          // Add disappearing properties if needed
          // disappear_after: disappearTime ? disappearTime : null,
          // is_one_time_view: isOneTimeView,
        })
        .select()
        .single();
        
      if (messageError) {
        toast({
          title: "Failed to send message",
          description: messageError.message,
          variant: "destructive",
        });
        return;
      }
      
      // Reset form
      setMessage("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else {
      // Update typing status when user is typing
      updateTypingStatus(true);
      
      // Clear typing status after a delay
      setTimeout(() => updateTypingStatus(false), 3000);
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

  const handleReaction = async (messageId: string, emoji: string) => {
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
        const { error: deleteError } = await supabase
          .from("reactions")
          .delete()
          .eq("id", existingReaction.id);
          
        if (deleteError) {
          console.error("Error removing reaction:", deleteError);
          return;
        }
        
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
        const { data: newReaction, error: insertError } = await supabase
          .from("reactions")
          .insert({
            message_id: messageId,
            user_id: user.id,
            emoji
          })
          .select()
          .single();
          
        if (insertError) {
          console.error("Error adding reaction:", insertError);
          return;
        }
        
        // Update UI manually (the real-time update will come later)
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === messageId) {
              return {
                ...msg,
                reactions: [...(msg.reactions || []), newReaction]
              };
            }
            return msg;
          })
        );
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

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageStatus = (message: Message) => {
    if (message.sender_id !== user?.id) return null;
    
    if (message.read_at) {
      return <CheckCheck size={14} className="text-ice-accent" />;
    } else {
      return <Check size={14} className="text-white/70" />;
    }
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
        <p className="text-white">Conversation not found</p>
        <GlassButton 
          className="mt-4"
          onClick={() => navigate("/chats")}
        >
          Back to Chats
        </GlassButton>
      </GlassContainer>
    );
  }

  return (
    <GlassContainer className="w-full max-w-md h-full max-h-[90vh] flex flex-col">
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
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="relative group">
              {msg.disappear_after ? (
                <DisappearingMessage
                  className={msg.sender_id === user?.id ? "message-sent" : "message-received"}
                  duration={msg.disappear_after}
                  onDisappear={() => handleMessageDisappear(msg.id)}
                >
                  <div className="flex items-start">
                    {msg.content && <p>{msg.content}</p>}
                    <Clock size={14} className="ml-1 mt-1 text-white/70" />
                  </div>
                </DisappearingMessage>
              ) : (
                <div className={msg.sender_id === user?.id ? "message-sent" : "message-received"}>
                  {msg.media_url && (
                    <div className="mb-2 relative">
                      {msg.is_one_time_view ? (
                        <div className="relative">
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center">
                            <GlassButton 
                              onClick={() => handleViewOneTimeMedia(msg.id)}
                              className="flex items-center gap-1"
                            >
                              <Eye size={16} />
                              <span>View Once</span>
                            </GlassButton>
                          </div>
                          <img 
                            src={msg.media_url} 
                            alt="One-time view media" 
                            className="w-full rounded-lg opacity-30 max-h-60 object-cover"
                          />
                        </div>
                      ) : (
                        <img 
                          src={msg.media_url} 
                          alt="Media" 
                          className="w-full rounded-lg max-h-60 object-cover"
                        />
                      )}
                    </div>
                  )}
                  
                  {msg.content && <p>{msg.content}</p>}
                  
                  <div className="flex items-center justify-end mt-1 space-x-1">
                    <span className="text-white/60 text-xs">
                      {formatTime(msg.created_at)}
                    </span>
                    {renderMessageStatus(msg)}
                  </div>
                  
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex mt-1 space-x-1">
                      {msg.reactions.map((reaction) => (
                        <span key={reaction.id} className="text-sm bg-white/10 px-1 rounded">
                          {reaction.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {!msg.disappear_after && (
                <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setReactingToMessageId(msg.id);
                      setShowEmojiPicker(true);
                    }}
                  >
                    <Smile size={14} />
                  </GlassButton>
                </div>
              )}
              
              {reactingToMessageId === msg.id && showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 glass p-2 rounded-lg flex space-x-2">
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      className="text-lg hover:bg-white/10 p-1 rounded"
                      onClick={() => handleReaction(msg.id, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {isTyping && (
            <div className="message-received w-auto">
              <TypingIndicator />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>
      
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
            onClick={handleSendMessage}
            className="bg-ice-accent/20 hover:bg-ice-accent/40"
          >
            <Send size={20} />
          </GlassButton>
        </div>
      </div>
    </GlassContainer>
  );
};

export default Conversation;
