import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassCard, GlassBadge } from "@/components/ui/glassmorphism";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPreviews } from "@/hooks/useChatPreviews";
import ChatHeader from "./ChatHeader";
import SearchBar from "./SearchBar";
import NewChatButton from "./NewChatButton";

// Time helper function
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

// Main component
const ChatList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { chats, loading } = useChatPreviews(user?.id);

  const filteredChats = chats.filter(chat => 
    chat.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <GlassContainer className="w-full max-w-md h-full max-h-[90vh] flex flex-col">
      <ChatHeader />
      
      <SearchBar 
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search contacts"
      />
      
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="text-center py-10">
            <p className="text-white/60">Loading chats...</p>
          </div>
        ) : filteredChats.length > 0 ? (
          <div className="space-y-3">
            {filteredChats.map((chat) => (
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
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <p className="text-white/60">No chats found</p>
            <p className="text-white/40 text-sm mt-2">Start a new chat to connect with someone</p>
          </div>
        )}
      </div>
      
      <NewChatButton />
    </GlassContainer>
  );
};

export default ChatList;
