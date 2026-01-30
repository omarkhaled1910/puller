import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { AudioTranscriptResult, TranscriptWithTimestamps, AudioErrorType } from "@/app/lib/types";

// Import our new YouTube utilities
import {
  validateYouTubeUrl,
  validateVideoAccessibility,
} from "@/app/lib/youtube/validators";
import { AudioDownloadOrchestrator } from "@/app/lib/youtube/downloader";
import { fetchTranscriptWithYoutubei } from "@/app/lib/youtube/transcript";

// Directories for storing files
const AUDIO_DIR = path.join(process.cwd(), "downloads", "audio");
const TRANSCRIPT_DIR = path.join(process.cwd(), "downloads", "transcripts");

// Logger
const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: "INFO", message, ...data }));
  },
  error: (message: string, error?: Error, data?: Record<string, unknown>) => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        message,
        error: error?.message,
        stack: error?.stack,
        ...data,
      })
    );
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: "WARN", message, ...data }));
  },
};

/**
 * Ensure directories exist
 */
async function ensureDirectories() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Fetch and format transcript with timestamps
 * Returns transcript data or error object
 */
async function getTranscriptWithTimestamps(
  videoId: string,
  videoTitle: string
): Promise<TranscriptWithTimestamps | { error: string }> {
  try {
    const transcriptResult = await fetchTranscriptWithYoutubei(videoId);

    // Check if the result is an error
    if ("error" in transcriptResult) {
      logger.error("Transcript fetch error", undefined, { videoId, error: transcriptResult.message });
      return { error: transcriptResult.message };
    }

    const transcriptData = transcriptResult;

    const segments = transcriptData.map((seg) => ({
      text: seg.text,
      start: seg.offset,
      end: seg.offset + seg.duration,
      startTime: formatTime(seg.offset),
      endTime: formatTime(seg.offset + seg.duration),
    }));

    const fullText = segments.map((s) => s.text).join(" ");

    // Save transcript to file
    const filename = `${videoId}.txt`;
    const transcriptPath = path.join(TRANSCRIPT_DIR, filename);

    const transcriptContent = `Video Title: ${videoTitle}\nVideo ID: ${videoId}\n\n${segments
      .map((s) => `[${s.startTime} - ${s.endTime}] ${s.text}`)
      .join("\n")}`;

    await fs.writeFile(transcriptPath, transcriptContent, "utf-8");

    return {
      videoId,
      videoTitle,
      segments,
      fullText,
      transcriptPath,
    };
  } catch (error) {
    logger.error("Transcript fetch error", error as Error, { videoId });
    return { error: error instanceof Error ? error.message : "Failed to fetch transcript" };
  }
}

/**
 * POST handler for audio-transcript API
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    await ensureDirectories();

    const { url } = await request.json();

    // 1. Validate URL
    if (!url) {
      return NextResponse.json(
        { error: "validation_error" as AudioErrorType, message: "URL is required" },
        { status: 400 }
      );
    }

    const urlValidation = validateYouTubeUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json(
        {
          error: "validation_error" as AudioErrorType,
          message: urlValidation.error || "Invalid YouTube URL",
        },
        { status: 400 }
      );
    }

    const videoId = urlValidation.videoId!;

    logger.info("Processing video", { videoId });

    // 2. Validate video accessibility
    const accessibilityCheck = await validateVideoAccessibility(videoId);

    if (!accessibilityCheck.accessible) {
      return NextResponse.json(
        {
          error: accessibilityCheck.error || "unknown_error",
          message: `Video validation failed: ${accessibilityCheck.error}`,
        },
        { status: 400 }
      );
    }

    const videoTitle = accessibilityCheck.info?.title || "Unknown Video";

    // 3. Download audio with retry
    const orchestrator = new AudioDownloadOrchestrator(AUDIO_DIR);
    const audioResult = await orchestrator.download(videoId, {
      quality: "best",
      format: "m4a",
      maxRetries: 3,
    });

    // 4. Get transcript (always attempt, even if audio fails)
    const transcriptResult = await getTranscriptWithTimestamps(videoId, videoTitle);

    // 5. Handle results with graceful degradation
    if ("error" in transcriptResult) {
      // Both failed
      if (!audioResult.success) {
        const duration = Date.now() - startTime;
        logger.error("Both audio and transcript failed", undefined, { videoId, duration });

        return NextResponse.json(
          {
            error: "complete_failure" as AudioErrorType,
            message: "Both audio download and transcript fetch failed",
            audioError: audioResult.error,
            transcriptError: transcriptResult.error,
          },
          { status: 500 }
        );
      }

      // Only transcript failed - return partial success
      logger.warn("Transcript failed but audio succeeded", { videoId });

      return NextResponse.json(
        {
          audio: audioResult,
          transcript: null,
          transcriptError: transcriptResult.error,
        },
        { status: 200 } // Return partial success
      );
    }

    // Audio failed but transcript succeeded - return partial success
    if (!audioResult.success) {
      logger.warn("Audio failed but transcript succeeded", { videoId });

      return NextResponse.json(
        {
          audio: audioResult,
          transcript: transcriptResult,
          audioError: audioResult.error,
        },
        { status: 200 } // Return partial success
      );
    }

    // Both succeeded
    const duration = Date.now() - startTime;
    logger.info("Processing completed successfully", { videoId, duration });

    const result: AudioTranscriptResult = {
      audio: audioResult,
      transcript: transcriptResult,
    };

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Unexpected error in audio-transcript API", error as Error);

    return NextResponse.json(
      {
        error: "server_error" as AudioErrorType,
        message: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
