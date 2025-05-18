
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassCard, GlassBadge, GlassInput, GlassButton } from "@/components/ui/glassmorphism";
import { Bell, LogOut, Plus, Search, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ChatPreview {
  id: string;
  username: string;
  lastMessage: string | null;
  timestamp: Date | null;
  unread: number;
  status?: string | null;
  otherUserId: string;
}

const ChatList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    const fetchChats = async () => {
      try {
        setLoading(true);
        
        // Get all chats the user participates in
        const { data: participations, error: partError } = await supabase
          .from("chat_participants")
          .select("chat_id")
          .eq("user_id", user.id);
        
        if (partError) {
          console.error("Error fetching participations:", partError);
          return;
        }

        if (!participations || participations.length === 0) {
          setChats([]);
          setLoading(false);
          return;
        }

        const chatIds = participations.map(p => p.chat_id);
        
        // For each chat, find the other participant
        const chatPreviews: ChatPreview[] = [];
        
        for (const chatId of chatIds) {
          // Get the other user in this chat
          const { data: otherParticipants, error: otherPartError } = await supabase
            .from("chat_participants")
            .select("user_id")
            .eq("chat_id", chatId)
            .neq("user_id", user.id);
          
          if (otherPartError || !otherParticipants || otherParticipants.length === 0) {
            console.error("Error fetching other participant:", otherPartError);
            continue;
          }
          
          const otherUserId = otherParticipants[0].user_id;
          
          // Get the other user's profile
          const { data: otherProfile, error: profileError } = await supabase
            .from("profiles")
            .select("username, status")
            .eq("id", otherUserId)
            .single();
            
          if (profileError || !otherProfile) {
            console.error("Error fetching profile:", profileError);
            continue;
          }
          
          // Get the latest message in this chat
          const { data: latestMessage, error: msgError } = await supabase
            .from("messages")
            .select("content, created_at, sender_id")
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
            
          // Count unread messages
          const { count: unreadCount, error: unreadError } = await supabase
            .from("messages")
            .select("id", { count: 'exact', head: true })
            .eq("chat_id", chatId)
            .neq("sender_id", user.id)
            .is("read_at", null);
            
          chatPreviews.push({
            id: chatId,
            username: otherProfile.username,
            lastMessage: latestMessage?.content || "Start a conversation",
            timestamp: latestMessage ? new Date(latestMessage.created_at) : null,
            unread: unreadCount || 0,
            status: otherProfile.status,
            otherUserId: otherUserId
          });
        }
        
        // Sort by latest message
        chatPreviews.sort((a, b) => {
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;
          return b.timestamp.getTime() - a.timestamp.getTime();
        });
        
        setChats(chatPreviews);
      } catch (error) {
        console.error("Error fetching chats:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchChats();
    
    // Set up real-time listener for new messages
    const channel = supabase
      .channel('chat_updates')
      .on('postgres_changes', 
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        }, 
        () => {
          // Refresh chat list on new message
          fetchChats();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filteredChats = chats.filter(chat => 
    chat.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // If less than a day, show time
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If less than a week, show day
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    // Otherwise show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <GlassContainer className="w-full max-w-md h-full max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Secure Chats</h1>
        <div className="flex gap-2">
          <GlassButton
            size="sm"
            variant="ghost"
            className="text-white/80 hover:text-white"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            className="text-white/80 hover:text-white"
            aria-label="Settings"
            onClick={() => navigate("/settings")}
          >
            <Settings size={20} />
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            className="text-white/80 hover:text-white"
            aria-label="Logout"
            onClick={handleLogout}
          >
            <LogOut size={20} />
          </GlassButton>
        </div>
      </div>
      
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={18} />
          <GlassInput 
            placeholder="Search contacts" 
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-10">
              <p className="text-white/60">Loading chats...</p>
            </div>
          ) : filteredChats.length > 0 ? (
            filteredChats.map((chat) => (
              <GlassCard 
                key={chat.id}
                className="flex items-center cursor-pointer"
                onClick={() => navigate(`/chats/${chat.id}`)}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-ice-dark/50 border border-ice-accent/30 flex items-center justify-center text-lg font-medium">
                    {chat.username.charAt(0)}
                  </div>
                  {chat.status && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-ice-dark"></div>
                  )}
                </div>
                
                <div className="ml-3 flex-1 overflow-hidden">
                  <div className="flex justify-between items-center">
                    <h3 className="text-white font-medium">{chat.username}</h3>
                    <span className="text-white/70 text-xs">{formatTime(chat.timestamp)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-white/70 text-sm truncate">{chat.lastMessage}</p>
                    {chat.unread > 0 && (
                      <GlassBadge variant="success" className="ml-2">
                        {chat.unread}
                      </GlassBadge>
                    )}
                  </div>
                  
                  {chat.status && (
                    <p className="text-ice-accent text-xs mt-1 truncate">
                      {chat.status}
                    </p>
                  )}
                </div>
              </GlassCard>
            ))
          ) : (
            <div className="text-center py-10">
              <p className="text-white/60">No chats found</p>
              <p className="text-white/40 text-sm mt-2">Start a new chat to connect with someone</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-white/10">
        <GlassButton
          className="w-full bg-ice-accent/20 hover:bg-ice-accent/40 flex items-center justify-center gap-2"
          onClick={() => navigate("/new-chat")}
        >
          <Plus size={18} />
          <span>New Secure Chat</span>
        </GlassButton>
      </div>
    </GlassContainer>
  );
};

export default ChatList;
