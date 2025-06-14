
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Types for better organization
interface ChatPreview {
  id: string;
  username: string;
  lastMessage: string | null;
  timestamp: Date | null;
  unread: number;
  status?: string | null;
  otherUserId: string;
}

// Hook for fetching chats - improves organization
export const useChatPreviews = (userId: string | undefined) => {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  const fetchChats = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      
      // Get all chats the user participates in
      const { data: participations, error: partError } = await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", userId);
      
      if (partError) {
        console.error("Error fetching participations:", partError);
        return;
      }

      if (!participations || participations.length === 0) {
        setChats([]);
        return;
      }

      const chatIds = participations.map(p => p.chat_id);
      const chatPreviews: ChatPreview[] = [];
      
      for (const chatId of chatIds) {
        // Get the other user in this chat
        const { data: otherParticipants, error: otherPartError } = await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("chat_id", chatId)
          .neq("user_id", userId);
        
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
          .maybeSingle();
          
        // Count unread messages
        const { count: unreadCount, error: unreadError } = await supabase
          .from("messages")
          .select("id", { count: 'exact', head: true })
          .eq("chat_id", chatId)
          .neq("sender_id", userId)
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
      toast({
        title: "Error",
        description: "Failed to load chats. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
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
    }
  }, [userId]);

  return { chats, loading, fetchChats };
};
