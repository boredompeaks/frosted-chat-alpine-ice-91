
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassButton } from "@/components/ui/glassmorphism";
import { ShieldCheck, Lock, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate("/chats");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassContainer className="w-full max-w-lg p-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-6">Secure Messaging</h1>
        
        <div className="mb-8">
          <p className="text-white/80 text-lg mb-4">
            End-to-end encrypted messaging with self-destructing messages and privacy features.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="flex flex-col items-center p-4 glass">
              <Lock className="text-ice-accent h-6 w-6 mb-2" />
              <h3 className="text-white font-medium mb-1">Private</h3>
              <p className="text-white/70 text-sm">End-to-end encrypted messages</p>
            </div>
            
            <div className="flex flex-col items-center p-4 glass">
              <MessageSquare className="text-ice-accent h-6 w-6 mb-2" />
              <h3 className="text-white font-medium mb-1">Ephemeral</h3>
              <p className="text-white/70 text-sm">Self-destructing messages</p>
            </div>
            
            <div className="flex flex-col items-center p-4 glass">
              <ShieldCheck className="text-ice-accent h-6 w-6 mb-2" />
              <h3 className="text-white font-medium mb-1">Secure</h3>
              <p className="text-white/70 text-sm">One-time view media</p>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <GlassButton
            size="lg"
            className="w-full bg-ice-accent/20 hover:bg-ice-accent/40"
            onClick={() => navigate("/login")}
          >
            Login
          </GlassButton>
          
          <GlassButton
            size="lg"
            className="w-full"
            onClick={() => navigate("/register")}
          >
            Create Account
          </GlassButton>
        </div>
      </GlassContainer>
    </div>
  );
};

export default Index;
