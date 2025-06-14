
import React from 'react';
import { GlassButton } from '@/components/ui/glassmorphism';
import { Plus, Search, Settings, Bell, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const ChatActions = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
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
  );
};

export default ChatActions;
