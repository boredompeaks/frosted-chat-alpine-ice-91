/**
 * FileUploadService - Handles secure file uploads to Supabase Storage
 * 
 * Features:
 * - Multi-format support (images, videos, audio, documents)
 * - Size validation (50MB limit)
 * - MIME type validation
 * - Progress tracking
 * - Error handling with user-friendly messages
 */

import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

export interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

export interface UploadResult {
    success: boolean;
    url?: string;
    error?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
}

export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

// Supported file types and their MIME types
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
    image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    video: ["video/mp4", "video/webm"],
    audio: ["audio/mpeg", "audio/wav", "audio/ogg"],
    document: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ],
};

// Flatten for easy lookup
const ALL_ALLOWED_TYPES = Object.values(ALLOWED_MIME_TYPES).flat();

// 50MB in bytes
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const BUCKET_NAME = "chat-media";

/**
 * Get file category from MIME type
 */
export const getFileCategory = (mimeType: string): string => {
    for (const [category, types] of Object.entries(ALLOWED_MIME_TYPES)) {
        if (types.includes(mimeType)) {
            return category;
        }
    }
    return "unknown";
};

/**
 * Validate file before upload
 */
export const validateFile = (file: File): FileValidationResult => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(file.size / (1024 * 1024));
        return {
            valid: false,
            error: `File too large (${sizeMB}MB). Maximum allowed size is 50MB.`,
        };
    }

    // Check MIME type
    if (!ALL_ALLOWED_TYPES.includes(file.type)) {
        return {
            valid: false,
            error: `File type "${file.type}" is not supported. Allowed: images, videos, audio, PDFs.`,
        };
    }

    return { valid: true };
};

/**
 * Generate secure file path
 */
const generateFilePath = (userId: string, chatId: string, file: File): string => {
    const fileExt = file.name.split(".").pop() || "bin";
    const uniqueId = uuidv4();
    // Structure: userId/chatId/uniqueId.ext
    return `${userId}/${chatId}/${uniqueId}.${fileExt}`;
};

/**
 * Upload file to Supabase Storage
 */
export const uploadFile = async (
    file: File,
    userId: string,
    chatId: string,
    onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> => {
    try {
        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const filePath = generateFilePath(userId, chatId, file);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
            });

        if (error) {
            console.error("Upload error:", error);

            // Handle specific error cases
            if (error.message.includes("Bucket not found")) {
                return {
                    success: false,
                    error: "Storage not configured. Please contact admin.",
                };
            }
            if (error.message.includes("Payload too large")) {
                return {
                    success: false,
                    error: "File too large for upload.",
                };
            }
            if (error.message.includes("mime type")) {
                return {
                    success: false,
                    error: "File type not allowed.",
                };
            }

            return {
                success: false,
                error: `Upload failed: ${error.message}`,
            };
        }

        // Get public URL (or signed URL for private bucket)
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        // For private buckets, generate a signed URL instead
        const { data: signedData, error: signedError } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days

        const finalUrl = signedData?.signedUrl || urlData?.publicUrl;

        if (!finalUrl) {
            return {
                success: false,
                error: "Failed to generate file URL.",
            };
        }

        return {
            success: true,
            url: finalUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
        };
    } catch (error) {
        console.error("Upload exception:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown upload error",
        };
    }
};

/**
 * Delete file from Supabase Storage
 */
export const deleteFile = async (filePath: string): Promise<boolean> => {
    try {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) {
            console.error("Delete error:", error);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Delete exception:", error);
        return false;
    }
};

/**
 * Get file extension display name
 */
export const getFileTypeDisplay = (mimeType: string): string => {
    const category = getFileCategory(mimeType);

    switch (category) {
        case "image":
            return "Image";
        case "video":
            return "Video";
        case "audio":
            return "Audio";
        case "document":
            if (mimeType === "application/pdf") return "PDF";
            if (mimeType.includes("word")) return "Word Document";
            return "Document";
        default:
            return "File";
    }
};

export default {
    uploadFile,
    deleteFile,
    validateFile,
    getFileCategory,
    getFileTypeDisplay,
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
};
