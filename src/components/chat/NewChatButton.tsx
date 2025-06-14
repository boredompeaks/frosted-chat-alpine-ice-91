
import React from 'react';
import { Plus } from 'lucide-react';
import { GlassButton } from '@/components/ui/glassmorphism';
import { useNavigate } from 'react-router-dom';

const NewChatButton = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 border-t border-white/10">
      <GlassButton
        className="w-full bg-ice-accent/20 hover:bg-ice-accent/40 flex items-center justify-center gap-2"
        onClick={() => navigate("/new-chat")}
      >
        <Plus size={18} />
        <span>New Secure Chat</span>
      </GlassButton>
    </div>
  );
};

export default NewChatButton;
