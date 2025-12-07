
import React, { useRef, useEffect } from 'react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Maximize2, Minimize2 } from 'lucide-react';
import { GlassButton } from "@/components/ui/glassmorphism";
import { CallControls } from './CallControls';

interface ActiveCallOverlayProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteUserName: string;
    callType: 'audio' | 'video';
    callDuration: number; // in seconds
    isMuted: boolean;
    isVideoEnabled: boolean;
    isScreenSharing: boolean;
    isMinimized?: boolean;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    onToggleScreenShare: () => void;
    onEndCall: () => void;
    onToggleMinimize?: () => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
    localStream,
    remoteStream,
    remoteUserName,
    callType,
    callDuration,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    isMinimized = false,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onEndCall,
    onToggleMinimize,
}) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (isMinimized) {
        return (
            <div className="fixed bottom-24 right-4 w-48 aspect-video bg-black/90 rounded-lg overflow-hidden border border-white/10 shadow-2xl z-50 group cursor-pointer animate-in slide-in-from-bottom duration-300">
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${!remoteStream ? 'hidden' : ''}`}
                />
                {!remoteStream && (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                        <Avatar className="w-10 h-10">
                            <AvatarFallback>{remoteUserName.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-white font-mono">{formatDuration(callDuration)}</span>
                    <div className="flex space-x-1">
                        <button onClick={onEndCall} className="p-1 bg-red-500 rounded-full text-white">
                            <div className="w-3 h-3 bg-white" style={{ maskImage: 'url("data:image/svg+xml,...")'/* simplified icon */ }} />
                        </button>
                        {onToggleMinimize && (
                            <button onClick={onToggleMinimize} className="p-1 bg-white/20 rounded-full text-white">
                                <Maximize2 size={12} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="absolute top-2 right-2 w-16 aspect-video bg-black rounded border border-white/20 overflow-hidden shadow-lg">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center overflow-hidden">
            {/* Remote Video (Full Screen) */}
            <div className="absolute inset-0 w-full h-full bg-zinc-900 grid place-items-center">
                {remoteStream ? (
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="flex flex-col items-center space-y-4 animate-pulse">
                        <Avatar className="w-32 h-32 border-4 border-white/10">
                            <AvatarFallback className="text-4xl bg-ice-accent/20 text-white">
                                {remoteUserName.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <p className="text-white/60">Waiting for remote video...</p>
                    </div>
                )}
            </div>

            {/* Header Info */}
            <div className="absolute top-0 inset-x-0 p-8 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <div className="pointer-events-auto flex items-center space-x-4">
                    <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center space-x-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-white font-medium">{remoteUserName}</span>
                        <span className="text-white/40">|</span>
                        <span className="text-white/60 font-mono tracking-wider">{formatDuration(callDuration)}</span>
                    </div>
                </div>

                {onToggleMinimize && (
                    <GlassButton
                        size="icon"
                        variant="ghost"
                        onClick={onToggleMinimize}
                        className="pointer-events-auto bg-black/20 hover:bg-black/40"
                    >
                        <Minimize2 size={24} />
                    </GlassButton>
                )}
            </div>

            {/* Local Video (PiP) */}
            {callType === 'video' && (
                <div className="absolute top-24 right-4 w-48 aspect-[3/4] md:w-64 md:aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/20 transition-all hover:scale-105 drag-handle">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
                    />
                    {!isVideoEnabled && (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                            <Avatar className="w-12 h-12">
                                <AvatarFallback>Me</AvatarFallback>
                            </Avatar>
                        </div>
                    )}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 rounded text-xs text-white">
                        You
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-12 inset-x-0 flex justify-center pointer-events-auto">
                <CallControls
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing}
                    onToggleMute={onToggleMute}
                    onToggleVideo={onToggleVideo}
                    onToggleScreenShare={onToggleScreenShare}
                    onEndCall={onEndCall}
                />
            </div>
        </div>
    );
};
