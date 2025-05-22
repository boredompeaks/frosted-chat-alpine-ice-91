
import React, { useState } from 'react';
import { Check, CheckCheck, Clock, Eye, Smile } from 'lucide-react';
import { GlassButton, DisappearingMessage } from "@/components/ui/glassmorphism";

interface MessageProps {
  id: string;
  content: string | null;
  sender_id: string | null;
  created_at: string | null;
  read_at: string | null;
  disappear_after: number | null;
  is_one_time_view: boolean | null;
  media_url: string | null;
  reactions?: any[] | undefined; // Made optional with ?
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
    
    if (read_at) {
      return <CheckCheck size={14} className="text-ice-accent" />;
    } else {
      return <Check size={14} className="text-white/70" />;
    }
  };

  if (disappear_after) {
    return (
      <DisappearingMessage
        className={isCurrentUserMessage ? "message-sent" : "message-received"}
        duration={disappear_after}
        onDisappear={() => onDisappear(id)}
      >
        <div className="flex items-start">
          {content && <p>{content}</p>}
          <Clock size={14} className="ml-1 mt-1 text-white/70" />
        </div>
      </DisappearingMessage>
    );
  }

  return (
    <div className="relative group">
      <div className={isCurrentUserMessage ? "message-sent" : "message-received"}>
        {media_url && (
          <div className="mb-2 relative">
            {is_one_time_view ? (
              <div className="relative">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center">
                  <GlassButton 
                    onClick={() => onViewOneTimeMedia(id)}
                    className="flex items-center gap-1"
                  >
                    <Eye size={16} />
                    <span>View Once</span>
                  </GlassButton>
                </div>
                <img 
                  src={media_url} 
                  alt="One-time view media" 
                  className="w-full rounded-lg opacity-30 max-h-60 object-cover"
                />
              </div>
            ) : (
              <img 
                src={media_url} 
                alt="Media" 
                className="w-full rounded-lg max-h-60 object-cover"
              />
            )}
          </div>
        )}
        
        {content && <p>{content}</p>}
        
        <div className="flex items-center justify-end mt-1 space-x-1">
          <span className="text-white/60 text-xs">
            {formatTime(created_at)}
          </span>
          {renderMessageStatus()}
        </div>
        
        {reactions && reactions.length > 0 && (
          <div className="flex mt-1 space-x-1">
            {reactions.map((reaction) => (
              <span key={reaction.id} className="text-sm bg-white/10 px-1 rounded">
                {reaction.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
      
      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <GlassButton
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => onReaction(id)}
        >
          <Smile size={14} />
        </GlassButton>
      </div>
    </div>
  );
};

export default Message;
