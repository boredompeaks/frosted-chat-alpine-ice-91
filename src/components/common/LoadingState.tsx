import React from "react";
import { motion } from "framer-motion";
import { Loader2, MessageCircle, Users, Phone, Video } from "lucide-react";

interface LoadingStateProps {
  type?: "spinner" | "skeleton" | "pulse" | "progress" | "chat" | "call" | "users";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
  message?: string;
  subMessage?: string;
  progress?: number;
  showAnimation?: boolean;
  className?: string;
  color?: "primary" | "secondary" | "accent" | "white";
  variant?: "default" | "minimal" | "glass" | "solid";
  animated?: boolean;
  repeat?: number;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  type = "spinner",
  size = "md",
  message,
  subMessage,
  progress,
  showAnimation = true,
  className = "",
  color = "primary",
  variant = "default",
  animated = true,
  repeat = 1,
}) => {
  // Size classes
  const sizeClasses = {
    xs: "w-4 h-4",
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
    full: "w-full h-full",
  };

  // Color classes
  const colorClasses = {
    primary: "text-blue-400",
    secondary: "text-purple-400",
    accent: "text-cyan-400",
    white: "text-white",
  };

  // Variant classes
  const variantClasses = {
    default: "glass",
    minimal: "",
    glass: "glass",
    solid: "bg-white/10",
  };

  // Message size classes
  const messageSizeClasses = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };

  const containerClasses = `
    flex flex-col items-center justify-center p-4
    ${variantClasses[variant]}
    ${className}
  `;

  const iconClasses = `
    ${sizeClasses[size]}
    ${colorClasses[color]}
    ${animated ? "animate-spin" : ""}
  `;

  // Spinner Component
  const Spinner = () => (
    <div className={containerClasses}>
      <Loader2 className={iconClasses} />
      {message && (
        <div className="mt-4 text-center">
          <p className={`${messageSizeClasses[size]} text-white font-medium`}>
            {message}
          </p>
          {subMessage && (
            <p className="text-sm text-white/60 mt-1">{subMessage}</p>
          )}
        </div>
      )}
    </div>
  );

  // Skeleton Components
  const SkeletonText = ({ lines = 1, className = "" }: { lines?: number; className?: string }) => (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="h-4 bg-white/10 rounded"
          animate={animated ? { opacity: [0.4, 0.8, 0.4] } : {}}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );

  const SkeletonAvatar = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    const avatarSizes = {
      sm: "w-8 h-8",
      md: "w-10 h-10",
      lg: "w-12 h-12",
    };

    return (
      <motion.div
        className={`${avatarSizes[size]} bg-white/10 rounded-full`}
        animate={animated ? { opacity: [0.4, 0.8, 0.4] } : {}}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  };

  const SkeletonCard = () => (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center space-x-3">
        <SkeletonAvatar />
        <div className="flex-1">
          <SkeletonText lines={1} className="w-1/3" />
          <SkeletonText lines={1} className="w-1/4 mt-1" />
        </div>
      </div>
      <SkeletonText lines={2} />
      <div className="flex space-x-2">
        <SkeletonText lines={1} className="w-16" />
        <SkeletonText lines={1} className="w-20" />
      </div>
    </div>
  );

  // Chat-specific loading states
  const ChatLoading = () => (
    <div className="space-y-4">
      {Array.from({ length: repeat }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <div className={`max-w-[70%] ${i % 2 === 0 ? "message-received" : "message-sent"} p-4 space-y-2`}>
            <SkeletonText lines={Math.floor(Math.random() * 3) + 1} />
            <div className="flex items-center space-x-2">
              <SkeletonText lines={1} className="w-8" />
              <SkeletonText lines={1} className="w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Call-specific loading states
  const CallLoading = () => (
    <div className="text-center space-y-6">
      <div className="relative">
        <motion.div
          className="w-24 h-24 bg-white/10 rounded-full mx-auto flex items-center justify-center"
          animate={animated ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {type === "call" ? (
            <Phone className="w-10 h-10 text-green-400" />
          ) : (
            <Video className="w-10 h-10 text-blue-400" />
          )}
        </motion.div>
        <motion.div
          className="absolute inset-0 w-24 h-24 border-2 border-white/20 rounded-full mx-auto"
          animate={animated ? { rotate: 360 } : {}}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <div>
        <p className="text-lg text-white font-medium">{message || "Connecting..."}</p>
        {subMessage && <p className="text-sm text-white/60 mt-1">{subMessage}</p>}
      </div>
    </div>
  );

  // Users list loading
  const UsersLoading = () => (
    <div className="space-y-3">
      {Array.from({ length: repeat }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3 p-3 glass-card">
          <SkeletonAvatar />
          <div className="flex-1">
            <SkeletonText lines={1} className="w-1/3" />
            <SkeletonText lines={1} className="w-1/4 mt-1" />
          </div>
          <div className="w-2 h-2 bg-white/20 rounded-full" />
        </div>
      ))}
    </div>
  );

  // Progress bar component
  const ProgressBar = () => (
    <div className="w-full space-y-3">
      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress || 0}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="flex justify-between text-sm text-white/60">
        <span>{message || "Loading..."}</span>
        <span>{Math.round(progress || 0)}%</span>
      </div>
    </div>
  );

  // Pulse loading animation
  const PulseLoading = () => (
    <div className="space-y-4">
      {Array.from({ length: repeat }).map((_, i) => (
        <motion.div
          key={i}
          className="glass-card p-4"
          animate={animated ? {
            opacity: [0.5, 1, 0.5],
            scale: [0.98, 1, 0.98],
          } : {}}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/10 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/10 rounded w-1/3" />
              <div className="h-3 bg-white/10 rounded w-1/4" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  // Skeleton loading for different content types
  const SkeletonLoading = () => {
    switch (size) {
      case "chat":
        return <ChatLoading />;
      case "call":
        return <CallLoading />;
      case "users":
        return <UsersLoading />;
      default:
        return (
          <div className="space-y-4">
            {Array.from({ length: repeat }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        );
    }
  };

  // Main render logic
  const renderLoadingState = () => {
    switch (type) {
      case "spinner":
        return <Spinner />;
      case "skeleton":
        return <SkeletonLoading />;
      case "pulse":
        return <PulseLoading />;
      case "progress":
        return (
          <div className={containerClasses}>
            <ProgressBar />
          </div>
        );
      case "chat":
        return <ChatLoading />;
      case "call":
        return <CallLoading />;
      case "users":
        return <UsersLoading />;
      default:
        return <Spinner />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={className}
    >
      {renderLoadingState()}
    </motion.div>
  );
};

// Specialized loading components for common use cases
export const ChatListSkeleton = () => (
  <LoadingState
    type="skeleton"
    size="chat"
    repeat={5}
    message="Loading conversations..."
  />
);

export const MessageListSkeleton = () => (
  <LoadingState
    type="skeleton"
    size="chat"
    repeat={8}
    message="Loading messages..."
  />
);

export const CallConnecting = ({ type = "video" }: { type?: "voice" | "video" }) => (
  <LoadingState
    type="call"
    size="xl"
    message={`Connecting ${type} call...`}
    subMessage="Please wait while we establish a secure connection"
  />
);

export const FileUploadProgress = ({ progress }: { progress: number }) => (
  <LoadingState
    type="progress"
    progress={progress}
    message="Uploading file..."
    subMessage={`${Math.round(progress)}% complete`}
  />
);

export const UserListSkeleton = ({ count = 3 }: { count?: number }) => (
  <LoadingState
    type="users"
    size="users"
    repeat={count}
    message="Loading users..."
  />
);

export const InitialLoading = () => (
  <LoadingState
    type="spinner"
    size="xl"
    message="Initializing secure connection..."
    subMessage="Preparing your encrypted messaging environment"
  />
);

export const PageLoading = ({ message = "Loading..." }: { message?: string }) => (
  <LoadingState
    type="spinner"
    size="lg"
    message={message}
    className="min-h-[50vh]"
  />
);

export const ComponentLoading = ({ message }: { message?: string }) => (
  <LoadingState
    type="spinner"
    size="sm"
    message={message}
    className="py-8"
  />
);

export const InlineLoading = ({ size = "xs" }: { size?: "xs" | "sm" | "md" }) => (
  <LoadingState
    type="spinner"
    size={size}
    showAnimation={true}
    className="py-2"
  />
);

export default LoadingState;
