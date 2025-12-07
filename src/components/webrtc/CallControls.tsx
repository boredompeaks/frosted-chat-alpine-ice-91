
import React from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff } from 'lucide-react';
import { GlassButton } from "@/components/ui/glassmorphism";

interface CallControlsProps {
    isMuted: boolean;
    isVideoEnabled: boolean;
    isScreenSharing: boolean;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    onToggleScreenShare: () => void;
    onEndCall: () => void;
    className?: string;
}

export const CallControls: React.FC<CallControlsProps> = ({
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onEndCall,
    className = "",
}) => {
    return (
        <div className={`flex items-center justify-center space-x-4 p-4 bg-black/40 backdrop-blur-md rounded-full border border-white/10 ${className}`}>
            <GlassButton
                variant="ghost"
                size="icon"
                onClick={onToggleMute}
                className={`rounded-full w-12 h-12 ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </GlassButton>

            <GlassButton
                variant="ghost"
                size="icon"
                onClick={onToggleVideo}
                className={`rounded-full w-12 h-12 ${!isVideoEnabled ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
                {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
            </GlassButton>

            <GlassButton
                variant="ghost"
                size="icon"
                onClick={onToggleScreenShare}
                className={`rounded-full w-12 h-12 ${isScreenSharing ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
                {isScreenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
            </GlassButton>

            <GlassButton
                variant="ghost"
                size="icon"
                onClick={onEndCall}
                className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700 text-white border-none shadow-lg shadow-red-900/20"
            >
                <PhoneOff size={28} />
            </GlassButton>
        </div>
    );
};
