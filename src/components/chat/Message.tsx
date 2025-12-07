import React, { useState } from 'react';
import { Check, CheckCheck, Clock, Eye, Smile, Lock } from 'lucide-react';
import { GlassButton, DisappearingMessage } from "@/components/ui/glassmorphism";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MessageProps {
  id: string;
  content: string | null;
  sender_id: string | null;
  created_at: string | null;
  read_at: string | null;
  disappear_after: number | null;
  is_one_time_view: boolean | null;
  media_url: string | null;
  reactions?: any[] | undefined;
  currentUserId: string | undefined;
  onReaction: (messageId: string) => void;
  onDisappear: (messageId: string) => void;
  onViewOneTimeMedia: (messageId: string) => void;
}

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Message: React.FC<MessageProps> = ({
  id,
  content,
  sender_id,
  created_at,
  read_at,
  disappear_after,
  is_one_time_view,
  media_url,
  reactions,
  currentUserId,
  onReaction,
  onDisappear,
  onViewOneTimeMedia
}) => {
  const isCurrentUserMessage = sender_id === currentUserId;

  const renderMessageStatus = () => {
    if (!isCurrentUserMessage) return null;
    if (read_at) return <CheckCheck size={14} className="text-ice-accent" />;
    return <Check size={14} className="text-white/70" />;
  };

  const MessageWrapper = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn("relative group max-w-[80%] mb-4", isCurrentUserMessage ? "ml-auto" : "mr-auto", className)}
    >
      {children}
    </motion.div>
  );

  if (disappear_after) {
    return (
      <MessageWrapper>
        <DisappearingMessage
          className={cn(
            "p-3 rounded-2xl backdrop-blur-md shadow-sm",
            isCurrentUserMessage 
              ? "bg-ice-accent/30 text-white rounded-tr-none border border-ice-accent/20" 
              : "bg-white/10 text-white rounded-tl-none border border-white/10"
          )}
          duration={disappear_after}
          onDisappear={() => onDisappear(id)}
        >
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-white/70" />
            {content && <p className="text-sm">{content}</p>}
          </div>
          <div className="mt-1 text-[10px] text-white/50 text-right w-full">
            Disappearing
          </div>
        </DisappearingMessage>
      </MessageWrapper>
    );
  }

  return (
    <MessageWrapper>
      <div 
        className={cn(
          "p-3 rounded-2xl backdrop-blur-md shadow-sm transition-all duration-200 hover:shadow-md",
          isCurrentUserMessage 
            ? "bg-gradient-to-br from-blue-600/40 to-blue-500/30 border border-blue-400/20 text-white rounded-tr-sm" 
            : "bg-gradient-to-br from-gray-800/60 to-gray-700/50 border border-white/10 text-gray-100 rounded-tl-sm"
        )}
      >
        {media_url && (
          <div className="mb-2 relative overflow-hidden rounded-lg">
            {is_one_time_view ? (
              <div className="relative bg-black/50 p-6 flex flex-col items-center justify-center gap-2 backdrop-blur-sm border border-white/10 rounded-lg">
                <Eye size={24} className="text-white/80" />
                <GlassButton 
                  onClick={() => onViewOneTimeMedia(id)}
                  className="text-xs bg-white/10 hover:bg-white/20"
                >
                  View Photo
                </GlassButton>
                <p className="text-[10px] text-white/50">One-time view</p>
              </div>
            ) : (
              <img 
                src={media_url} 
                alt="Media" 
                className="w-full max-h-60 object-cover hover:scale-105 transition-transform duration-500"
              />
            )}
          </div>
        )}
        
        {content && (
          <p className="text-[15px] leading-relaxed break-words">
            {content}
          </p>
        )}
        
        <div className="flex items-center justify-end mt-1 gap-1">
          <span className="text-[10px] text-white/40 font-medium">
            {formatTime(created_at)}
          </span>
          {renderMessageStatus()}
        </div>
        
        {reactions && reactions.length > 0 && (
          <div className="absolute -bottom-3 left-2 flex -space-x-1">
            {reactions.map((reaction, i) => (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                key={reaction.id || i} 
                className="text-xs bg-gray-800/90 border border-white/10 px-1.5 py-0.5 rounded-full shadow-sm backdrop-blur-md"
              >
                {reaction.emoji}
              </motion.span>
            ))}
          </div>
        )}
      </div>
      
      {/* Reaction Button (Micro-interaction) */}
      <motion.div 
        className={cn(
          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          isCurrentUserMessage ? "-left-8" : "-right-8"
        )}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <GlassButton
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-full bg-black/20 hover:bg-black/40 border border-white/5"
          onClick={() => onReaction(id)}
        >
          <Smile size={14} className="text-white/70" />
        </GlassButton>
      </motion.div>
    </MessageWrapper>
  );
};

export default Message;
