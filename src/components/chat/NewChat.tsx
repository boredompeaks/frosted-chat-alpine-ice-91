import React from "react";
import { useNavigate } from "react-router-dom";
import { GlassContainer, GlassButton } from "@/components/ui/glassmorphism";
import { ArrowLeft } from "lucide-react";
import UserSearch from "./UserSearch";

const NewChat = () => {
  const navigate = useNavigate();

  return (
    <GlassContainer className="w-full max-w-2xl h-full max-h-[90vh] flex flex-col">
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
      
      <div className="flex-1 overflow-y-auto p-4">
        <UserSearch />
      </div>
    </GlassContainer>
  );
};

export default NewChat;
