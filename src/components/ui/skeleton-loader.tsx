
import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    variant?: "text" | "circular" | "rectangular" | "bubble-left" | "bubble-right";
}

export const Skeleton = ({ className, variant = "text", ...props }: SkeletonProps) => {
    const baseClasses = "animate-pulse bg-white/10 rounded-md";

    const variantClasses = {
        text: "h-4 w-full",
        circular: "rounded-full",
        rectangular: "w-full h-full",
        "bubble-left": "h-12 w-3/4 rounded-tr-lg rounded-tl-lg rounded-br-lg rounded-bl-none",
        "bubble-right": "h-12 w-3/4 ml-auto rounded-tr-lg rounded-tl-lg rounded-bl-lg rounded-br-none bg-ice-accent/20",
    };

    return (
        <div
            className={cn(baseClasses, variantClasses[variant], className)}
            {...props}
        />
    );
};

export const ChatSkeleton = () => {
    return (
        <div className="flex flex-col space-y-4 p-4 w-full h-full">
            {/* Date separator */}
            <div className="flex justify-center">
                <Skeleton className="h-6 w-32 rounded-full" />
            </div>

            {/* Messages */}
            <div className="flex items-end space-x-2">
                <Skeleton variant="circular" className="h-8 w-8 mb-1" />
                <Skeleton variant="bubble-left" className="w-[60%]" />
            </div>

            <div className="flex items-end space-x-2">
                <Skeleton variant="circular" className="h-8 w-8 mb-1" />
                <Skeleton variant="bubble-left" className="w-[40%]" />
            </div>

            <div className="flex flex-col items-end space-y-1">
                <Skeleton variant="bubble-right" className="w-[70%]" />
                <Skeleton variant="text" className="h-3 w-16 bg-white/5" />
            </div>

            <div className="flex items-end space-x-2">
                <Skeleton variant="circular" className="h-8 w-8 mb-1" />
                <div className="flex flex-col space-y-2 w-[65%]">
                    <Skeleton variant="bubble-left" className="w-full h-32" /> {/* Image placeholder */}
                </div>
            </div>

            <div className="flex flex-col items-end space-y-1 mt-auto">
                <Skeleton variant="bubble-right" className="w-[50%]" />
            </div>
        </div>
    );
};
