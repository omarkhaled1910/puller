// YouTube transcript fetcher using yt-dlp

import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import type { TranscriptSegment } from "@/app/lib/types";

const execAsync = promisify(exec);

const TRANSCRIPT_LOGGER = {
  debug: (...args: unknown[]) => console.log("[yt-dlp transcript]", ...args),
  info: (...args: unknown[]) => console.info("[yt-dlp transcript]", ...args),
  warn: (...args: unknown[]) => console.warn("[yt-dlp transcript]", ...args),
  error: (...args: unknown[]) => console.error("[yt-dlp transcript]", ...args),
};

// Temporary directory for downloads
const TEMP_DIR = path.join(process.cwd(), "downloads", "temp");

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(): Promise<void> {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Fetch transcript for a YouTube video using yt-dlp
 * @param videoId - YouTube video ID
 * @returns Array of transcript segments or error object
 */
export async function fetchTranscriptWithYoutubei(
  videoId: string
): Promise<TranscriptSegment[] | { error: string; message: string }> {
  try {
    TRANSCRIPT_LOGGER.info(`Fetching transcript for ${videoId}`);

    await ensureTempDir();

    // Output file path
    const outputFile = path.join(TEMP_DIR, `${videoId}.en.json3`);

    // Build yt-dlp command
    // --write-subs: Download subtitles
    // --skip-download: Don't download the video
    // --sub-lang en: Get English subtitles
    // --sub-format json3: Use JSON3 format (easier to parse)
    // Note: We need to escape the output template for the shell
    const outputTemplate = `/Users/omarkhaled/Desktop/puller/downloads/temp/${videoId}.%(ext)s`;
    const command = `yt-dlp --write-subs --skip-download --sub-lang en --sub-format json3 -o "${outputTemplate}" "https://www.youtube.com/watch?v=${videoId}"`;

    TRANSCRIPT_LOGGER.debug(`Running: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 1 minute timeout
      });

      // Check if the file was created
      const actualFile = path.join(TEMP_DIR, `${videoId}.en.json3`);
      let fileContent: string;

      try {
        fileContent = await fs.readFile(actualFile, "utf-8");
      } catch {
        // Try with just videoId.json3 (sometimes yt-dlp names it differently)
        const altFile = path.join(TEMP_DIR, `${videoId}.json3`);
        fileContent = await fs.readFile(altFile, "utf-8");
      }

      // Clean up temp file
      try {
        await fs.unlink(actualFile);
      } catch {}

      // Parse JSON3 format
      const data = JSON.parse(fileContent);

      if (!data.events || data.events.length === 0) {
        return {
          error: "no_transcript",
          message: "Transcript file contains no events",
        };
      }

      // Map JSON3 format to our TranscriptSegment format
      const segments: TranscriptSegment[] = data.events
        .filter((event: any) => event.segs && event.segs.length > 0)
        .map((event: any) => {
          const startMs = event.tStartMs || 0;
          const durationMs = event.dDurationMs || 0;

          // Concatenate all segments (text parts)
          const text = event.segs
            .map((seg: any) => seg.utf8 || "")
            .join("")
            .replace(/\n/g, " ") // Replace newlines with spaces
            .replace(/\s+/g, " ") // Collapse multiple spaces
            .trim();

          return {
            text: text,
            duration: durationMs / 1000, // Convert ms to seconds
            offset: startMs / 1000, // Convert ms to seconds
          };
        })
        .filter((seg: TranscriptSegment) => seg.text.length > 0); // Filter out empty segments

      if (segments.length === 0) {
        return {
          error: "no_transcript",
          message: "No valid transcript segments found",
        };
      }

      TRANSCRIPT_LOGGER.info(`Successfully fetched ${segments.length} transcript segments`);
      return segments;

    } catch (execError: any) {
      // Check if it's a timeout
      if (execError.killed || execError.signal === "SIGTERM") {
        return {
          error: "timeout",
          message: "Transcript fetch timed out",
        };
      }

      // Check for specific error messages
      const stderr = execError.stderr || "";
      if (stderr.includes("Video unavailable") || stderr.includes("private")) {
        return {
          error: "video_unavailable",
          message: "This video is private or unavailable",
        };
      }

      if (stderr.includes("subtitles") || stderr.includes("captions")) {
        return {
          error: "no_transcript",
          message: "This video does not have captions or subtitles available",
        };
      }

      TRANSCRIPT_LOGGER.error("yt-dlp exec error", execError);
      return {
        error: "fetch_error",
        message: `Failed to fetch transcript: ${execError.message}`,
      };
    }

  } catch (error) {
    TRANSCRIPT_LOGGER.error("Error fetching transcript", error);

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes("caption") ||
        errorMessage.includes("transcript") ||
        errorMessage.includes("not found")
      ) {
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

/**
 * Alternative method: Fetch transcript by parsing caption track directly
 * This is a fallback method that accesses caption tracks via the video info
 */
export async function fetchTranscriptViaCaptionTrack(
  videoId: string
): Promise<TranscriptSegment[] | { error: string; message: string }> {
  // This is now an alias to the main function
  return fetchTranscriptWithYoutubei(videoId);
}
