"use server";

import { fetchTranscriptWithYoutubei } from "@/app/lib/youtube/transcript";
import type { TranscriptSegment, TranscriptError } from "@/app/lib/types";
import { z } from "zod";

// Zod schema for input validation
const YouTubeUrlSchema = z.string().url().refine(
  (url) => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
    ];
    return patterns.some((pattern) => pattern.test(url));
  },
  { message: "Invalid YouTube URL format" }
);

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
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
 * Fetch transcript for a YouTube video
 * @param url - YouTube video URL
 * @returns Array of transcript segments or error object
 */
export async function fetchTranscript(
  url: string
): Promise<TranscriptSegment[] | TranscriptError> {
  try {
    // Validate input URL
    const validationResult = YouTubeUrlSchema.safeParse(url);
    if (!validationResult.success) {
      return {
        error: "validation_error",
        message: validationResult.error.errors[0]?.message || "Invalid URL format",
      };
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return {
        error: "invalid_url",
        message: "Could not extract video ID from the provided URL",
      };
    }

    // Fetch transcript from YouTube using youtubei.js
    const transcriptResult = await fetchTranscriptWithYoutubei(videoId);

    // Check if the result is an error
    if ("error" in transcriptResult) {
      return transcriptResult as TranscriptError;
    }

    const transcriptData = transcriptResult;

    // Transform and validate transcript data
    const segments: TranscriptSegment[] = transcriptData.map((segment) => ({
      text: segment.text,
      duration: segment.duration,
      offset: segment.offset,
    }));

    if (segments.length === 0) {
      return {
        error: "no_transcript",
        message: "No transcript available for this video",
      };
    }

    return segments;

  } catch (error) {
    console.error("Fetch transcript error:", error);
    // Handle specific error cases
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("captions") || errorMessage.includes("transcript")) {
        return {
          error: "no_transcript",
          message: "This video does not have captions or subtitles available",
        };
      }

      if (errorMessage.includes("private") || errorMessage.includes("unavailable")) {
        return {
          error: "video_unavailable",
          message: "This video is private or unavailable",
        };
      }

      return {
        error: "fetch_error",
        message: `Failed to fetch transcript: ${error.message}`,
      };
    }

    return {
      error: "unknown_error",
      message: "An unknown error occurred while fetching the transcript",
    };
  }
}
