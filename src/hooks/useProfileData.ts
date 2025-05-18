
import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for fetching and managing user profile data
 */
export const useProfileData = (userId: string | undefined) => {
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = async (id: string) => {
    if (!id) return;
    
    try {
      setLoading(true);
      console.log("Fetching profile for user:", id);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return;
      }

      console.log("Profile fetched:", data);
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchProfile(userId);
    }
  }, [userId]);

  return { profile, refreshProfile: () => userId && fetchProfile(userId), loading };
};
