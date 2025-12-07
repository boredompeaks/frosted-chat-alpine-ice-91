
import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { GlassButton } from "@/components/ui/glassmorphism";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface IncomingCallOverlayProps {
    callerName: string;
    callerAvatar?: string;
    callType: 'audio' | 'video';
    onAccept: () => void;
    onReject: () => void;
}

export const IncomingCallOverlay: React.FC<IncomingCallOverlayProps> = ({
    callerName,
    callerAvatar,
    callType,
    onAccept,
    onReject,
}) => {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex flex-col items-center space-y-6 p-8">
                <div className="relative">
                    <Avatar className="w-32 h-32 border-4 border-white/10 shadow-2xl animate-pulse">
                        <AvatarImage src={callerAvatar} />
                        <AvatarFallback className="text-4xl bg-ice-accent/20 text-white">
                            {callerName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-2 -right-2 bg-ice-dark p-2 rounded-full border border-white/10 text-ice-accent">
                        {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                        {callerName}
                    </h2>
                    <p className="text-white/60">
                        Incoming {callType} call...
                    </p>
                </div>

                <div className="flex items-center space-x-8 pt-8">
                    <div className="flex flex-col items-center space-y-2">
                        <GlassButton
                            size="icon"
                            onClick={onReject}
                            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 border-none shadow-lg shadow-red-900/20 transition-transform hover:scale-110"
                        >
                            <PhoneOff size={32} className="text-white" />
                        </GlassButton>
                        <span className="text-sm text-white/50">Decline</span>
                    </div>

                    <div className="flex flex-col items-center space-y-2">
                        <GlassButton
                            size="icon"
                            onClick={onAccept}
                            className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 border-none shadow-lg shadow-green-900/20 transition-transform hover:scale-110 animate-bounce"
                        >
                            <Phone size={32} className="text-white" />
                        </GlassButton>
                        <span className="text-sm text-white/50">Accept</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
