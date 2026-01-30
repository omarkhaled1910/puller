// URL and video validation utilities

import type { AudioErrorType } from "./errors";

export interface UrlValidationResult {
  valid: boolean;
  videoId?: string;
  error?: string;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  thumbnail?: string;
  author?: string;
}

export interface AccessibilityCheckResult {
  accessible: boolean;
  error?: AudioErrorType;
  info?: Partial<VideoInfo>;
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Validate YouTube URL format and extract video ID
 */
export function validateYouTubeUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  url = url.trim();

  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
  ];

  if (!patterns.some((p) => p.test(url))) {
    return { valid: false, error: "Invalid YouTube URL format" };
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return { valid: false, error: "Could not extract video ID from URL" };
  }

  return { valid: true, videoId };
}

/**
 * Check video accessibility using YouTube's oEmbed API
 * This is a lightweight check that works even for restricted videos
 */
export async function validateVideoAccessibility(
  videoId: string
): Promise<AccessibilityCheckResult> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (response.status === 404) {
      return { accessible: false, error: "video_unavailable" };
    }

    if (response.status === 401 || response.status === 403) {
      return { accessible: false, error: "private_video" };
    }

    if (!response.ok) {
      return { accessible: false, error: "unknown_error" };
    }

    const data = await response.json();
    return {
      accessible: true,
      info: {
        videoId,
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
      },
    };
  } catch (error) {
    // If oEmbed fails (network error, timeout, etc.), we'll let the download proceed anyway
    // The actual download will provide a more definitive error
    return {
      accessible: true,
    };
  }
}

/**
 * Check if a video ID is valid format
 */
export function isValidVideoId(videoId: string): boolean {
  // YouTube video IDs are typically 11 characters and contain alphanumeric, hyphen, and underscore
  return /^[\w-]{11}$/.test(videoId);
}
