
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
      try {
        setLoading(true);
        console.log("Fetching users, current user ID:", user.id);
        
        // Build query to get all users except current user
        let query = supabase
          .from("profiles")
          .select("id, username, status")
          .neq("id", user.id);
          
        // Only apply the search filter if there is a query
        if (searchQuery.trim()) {
          query = query.ilike("username", `%${searchQuery}%`);
        }
        
        const { data, error } = await query.order("username").limit(50);
        
        if (error) {
          console.error("Error searching users:", error);
          toast({
            title: "Search error",
            description: "Failed to search users. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        console.log("Found users:", data);
        setUsers(data || []);
      } catch (error) {
        console.error("Error fetching users:", error);
        toast({
          title: "Error",
          description: "Something went wrong while searching for users.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    // Fetch users immediately and then on search query change
    fetchUsers();
  }, [searchQuery, user, toast]);

  const handleStartChat = async (otherUserId: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log("Starting chat between", user.id, "and", otherUserId);
      
      // Check if a chat already exists between these users
      const { data: currentUserChats, error: partError } = await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", user.id);
      
      if (partError) {
        console.error("Error fetching current user chats:", partError);
        toast({
          title: "Error",
          description: "Failed to check existing chats",
          variant: "destructive",
        });
        return;
      }
      
      if (currentUserChats && currentUserChats.length > 0) {
        // For each chat the current user is in, check if the other user is also in it
        for (const chat of currentUserChats) {
          const { data: otherParticipant, error: checkError } = await supabase
            .from("chat_participants")
            .select("*")
            .eq("chat_id", chat.chat_id)
            .eq("user_id", otherUserId)
            .maybeSingle();
          
          if (!checkError && otherParticipant) {
            // Chat already exists, navigate to it
            console.log("Existing chat found:", chat.chat_id);
            navigate(`/chats/${chat.chat_id}`);
            return;
          }
        }
      }
      
      // Create a new chat
      console.log("Creating new chat...");
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({})
        .select()
        .single();
      
      if (chatError || !newChat) {
        console.error("Error creating chat:", chatError);
        toast({
          title: "Error",
          description: "Failed to create chat",
          variant: "destructive",
        });
        return;
      }
      
      console.log("New chat created:", newChat.id);
      
      // Add both users to the chat
      const { error: participantsError } = await supabase
        .from("chat_participants")
        .insert([
          {
            chat_id: newChat.id,
            user_id: user.id
          },
          {
            chat_id: newChat.id,
            user_id: otherUserId
          }
        ]);
      
      if (participantsError) {
        console.error("Error adding participants:", participantsError);
        toast({
          title: "Error",
          description: "Failed to add participants to chat",
          variant: "destructive",
        });
        return;
      }
      
      console.log("Participants added successfully");
      
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
    } finally {
      setLoading(false);
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
            placeholder="Search for users by username" 
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
            users.map((userProfile) => (
              <GlassCard 
                key={userProfile.id}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-full bg-ice-dark/50 border border-ice-accent/30 flex items-center justify-center text-lg font-medium">
                    {userProfile.username.charAt(0)}
                  </div>
                  
                  <div className="ml-3">
                    <h3 className="text-white font-medium">{userProfile.username}</h3>
                    <p className="text-white/60 text-sm">{userProfile.status || "Available"}</p>
                  </div>
                </div>
                
                <GlassButton
                  size="sm"
                  className="bg-ice-accent/20 hover:bg-ice-accent/40"
                  onClick={() => handleStartChat(userProfile.id)}
                  disabled={loading}
                >
                  <UserPlus size={18} />
                </GlassButton>
              </GlassCard>
            ))
          ) : (
            <div className="text-center py-10">
              <p className="text-white/60">
                {searchQuery ? "No users found matching your search" : "No other users found"}
              </p>
              <p className="text-white/40 text-sm mt-2">
                Try a different search term or check back later
              </p>
            </div>
          )}
        </div>
      </div>
    </GlassContainer>
  );
};

export default NewChat;
