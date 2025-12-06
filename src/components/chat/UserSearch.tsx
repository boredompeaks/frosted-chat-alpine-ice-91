import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassButton } from "@/components/ui/glassmorphism";
import { Search, User, Loader2, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  last_seen: string;
}

export const UserSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Search users
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, status, last_seen")
          .neq("id", user?.id || "")
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .limit(10);

        if (error) throw error;

        setSearchResults(data || []);
      } catch (error: any) {
        console.error("Error searching users:", error);
        toast({
          title: "Search failed",
          description: error.message || "Failed to search users",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, user?.id, toast]);

  // Create or navigate to existing chat
  const handleStartChat = async (recipientId: string) => {
    if (!user) return;

    setCreating(recipientId);
    try {
      // Check if chat already exists
      const { data: existingChats, error: checkError } = await supabase
        .from("chat_participants")
        .select(`
          chat_id,
          chats!inner(
            id,
            is_group
          )
        `)
        .eq("user_id", user.id);

      if (checkError) throw checkError;

      // Find existing 1-on-1 chat with this user
      let existingChatId: string | null = null;

      if (existingChats) {
        for (const participant of existingChats) {
          const { data: otherParticipants, error: otherError } = await supabase
            .from("chat_participants")
            .select("user_id")
            .eq("chat_id", participant.chat_id);

          if (!otherError && otherParticipants) {
            const userIds = otherParticipants.map((p) => p.user_id);
            if (
              userIds.length === 2 &&
              userIds.includes(user.id) &&
              userIds.includes(recipientId)
            ) {
              existingChatId = participant.chat_id;
              break;
            }
          }
        }
      }

      // If chat exists, navigate to it
      if (existingChatId) {
        navigate(`/chats/${existingChatId}`);
        return;
      }

      // Create new chat
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({
          is_group: false,
          created_by: user.id,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Add participants
      const { error: participantsError } = await supabase
        .from("chat_participants")
        .insert([
          {
            chat_id: newChat.id,
            user_id: user.id,
            role: "admin",
          },
          {
            chat_id: newChat.id,
            user_id: recipientId,
            role: "member",
          },
        ]);

      if (participantsError) throw participantsError;

      toast({
        title: "Chat created",
        description: "You can now start messaging",
      });

      navigate(`/chats/${newChat.id}`);
    } catch (error: any) {
      console.error("Error creating chat:", error);
      toast({
        title: "Failed to create chat",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Search Input */}
      <GlassContainer className="p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 h-5 w-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by username..."
            className="w-full pl-10 pr-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-ice-accent/50"
          />
        </div>
      </GlassContainer>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
        </div>
      )}

      {/* Search Results */}
      <AnimatePresence>
        {searchResults.length > 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-3"
          >
            {searchResults.map((profile, index) => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassContainer className="p-4 hover:bg-white/10 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {/* Avatar */}
                      <div className="relative">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <User className="h-6 w-6 text-white" />
                          </div>
                        )}
                        {/* Status Indicator */}
                        {profile.status === "online" && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                        )}
                      </div>

                      {/* User Info */}
                      <div>
                        <h3 className="text-white font-semibold">
                          {profile.display_name || profile.username}
                        </h3>
                        <p className="text-white/60 text-sm">
                          @{profile.username}
                        </p>
                        <p className="text-white/40 text-xs">
                          {profile.status === "online"
                            ? "Online"
                            : `Last seen ${new Date(
                                profile.last_seen
                              ).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <GlassButton
                      onClick={() => handleStartChat(profile.id)}
                      disabled={creating === profile.id}
                      className="bg-ice-accent/20 hover:bg-ice-accent/40"
                    >
                      {creating === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Chat
                        </>
                      )}
                    </GlassButton>
                  </div>
                </GlassContainer>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Results */}
      {searchQuery.length >= 2 && searchResults.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <User className="h-16 w-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 text-lg">No users found</p>
          <p className="text-white/40 text-sm mt-2">
            Try a different username
          </p>
        </motion.div>
      )}

      {/* Empty State */}
      {searchQuery.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <Search className="h-16 w-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 text-lg">Search for users</p>
          <p className="text-white/40 text-sm mt-2">
            Enter at least 2 characters to search
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default UserSearch;
