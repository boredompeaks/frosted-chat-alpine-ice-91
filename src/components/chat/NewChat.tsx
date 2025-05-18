
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassInput, GlassButton, GlassCard } from "@/components/ui/glassmorphism";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  username: string;
  status: string | null;
}

const NewChat = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    const fetchUsers = async () => {
      if (!searchQuery.trim()) {
        setUsers([]);
        return;
      }
      
      try {
        setLoading(true);
        // Find users that match the search query but exclude the current user
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, status")
          .neq("id", user.id)
          .ilike("username", `%${searchQuery}%`)
          .limit(10);
        
        if (error) {
          console.error("Error searching users:", error);
          return;
        }
        
        setUsers(data || []);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Add a small delay to avoid too many queries while typing
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  const handleStartChat = async (otherUserId: string) => {
    if (!user) return;
    
    try {
      // Check if a chat already exists between these users
      const { data: existingChats, error: findError } = await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", user.id);
      
      if (findError) {
        toast({
          title: "Error",
          description: "Failed to check existing chats",
          variant: "destructive",
        });
        return;
      }
      
      if (existingChats && existingChats.length > 0) {
        // For each chat the current user is in, check if the other user is also in it
        for (const chat of existingChats) {
          const { data: otherParticipant, error: checkError } = await supabase
            .from("chat_participants")
            .select("*")
            .eq("chat_id", chat.chat_id)
            .eq("user_id", otherUserId)
            .maybeSingle();
          
          if (!checkError && otherParticipant) {
            // Chat already exists, navigate to it
            navigate(`/chats/${chat.chat_id}`);
            return;
          }
        }
      }
      
      // Create a new chat
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({})
        .select()
        .single();
      
      if (chatError || !newChat) {
        toast({
          title: "Error",
          description: "Failed to create chat",
          variant: "destructive",
        });
        return;
      }
      
      // Add both users to the chat
      const { error: currentUserPartError } = await supabase
        .from("chat_participants")
        .insert({
          chat_id: newChat.id,
          user_id: user.id
        });
      
      const { error: otherUserPartError } = await supabase
        .from("chat_participants")
        .insert({
          chat_id: newChat.id,
          user_id: otherUserId
        });
      
      if (currentUserPartError || otherUserPartError) {
        toast({
          title: "Error",
          description: "Failed to add participants to chat",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Chat started",
        description: "You can now start messaging securely",
      });
      
      // Navigate to the new chat
      navigate(`/chats/${newChat.id}`);
    } catch (error) {
      console.error("Error starting chat:", error);
      toast({
        title: "Error",
        description: "Something went wrong",
        variant: "destructive",
      });
    }
  };

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
        <h1 className="text-xl font-bold text-white">New Secure Chat</h1>
      </div>
      
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" size={18} />
          <GlassInput 
            placeholder="Search for users" 
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
              <p className="text-white/60">Searching users...</p>
            </div>
          ) : users.length > 0 ? (
            users.map((user) => (
              <GlassCard 
                key={user.id}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-full bg-ice-dark/50 border border-ice-accent/30 flex items-center justify-center text-lg font-medium">
                    {user.username.charAt(0)}
                  </div>
                  
                  <div className="ml-3">
                    <h3 className="text-white font-medium">{user.username}</h3>
                    <p className="text-white/60 text-sm">{user.status || "No status"}</p>
                  </div>
                </div>
                
                <GlassButton
                  size="sm"
                  className="bg-ice-accent/20 hover:bg-ice-accent/40"
                  onClick={() => handleStartChat(user.id)}
                >
                  <UserPlus size={18} />
                </GlassButton>
              </GlassCard>
            ))
          ) : searchQuery ? (
            <div className="text-center py-10">
              <p className="text-white/60">No users found</p>
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-white/60">Search for users to start a chat</p>
            </div>
          )}
        </div>
      </div>
    </GlassContainer>
  );
};

export default NewChat;
