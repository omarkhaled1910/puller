// Audio download orchestrator using ytdl-core

import ytdl from "@distube/ytdl-core";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import path from "path";
import { Readable } from "stream";

import {
  YouTubeDownloadError,
  VideoUnavailableError,
  NoFormatsError,
  PrivateVideoError,
  AgeRestrictedError,
  type DownloadProvider,
  type AudioDownloadError,
} from "./errors";
import { withRetry } from "./retry";

export interface DownloadOptions {
  quality?: "best" | "worst" | "bestaudio" | "worstaudio";
  format?: "mp4" | "m4a" | "mp3";
  maxRetries?: number;
  timeout?: number;
}

export interface DownloadResult {
  success: boolean;
  audioPath: string;
  videoId: string;
  filename: string;
  duration?: number;
  provider?: DownloadProvider;
  error?: AudioDownloadError;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  duration: number;
  thumbnail: string;
  author?: string;
}

const YTDL_LOGGER = {
  debug: (...args: unknown[]) => console.log("[ytdl-core]", ...args),
  info: (...args: unknown[]) => console.info("[ytdl-core]", ...args),
  warn: (...args: unknown[]) => console.warn("[ytdl-core]", ...args),
  error: (...args: unknown[]) => console.error("[ytdl-core]", ...args),
};

/**
 * Get video info using ytdl-core
 */
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  YTDL_LOGGER.info(`Getting video info for ${videoId}`);

  try {
    const info = await withRetry(
      async () => {
        return await ytdl.getInfo(videoId);
      },
      {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          YTDL_LOGGER.warn(
            `Retry ${attempt} for getVideoInfo: ${error.message}`
          );
        },
      }
    );

    const videoDetails = info.videoDetails;

    if (videoDetails.isLiveContent) {
      throw new YouTubeDownloadError(
        "video_unavailable",
        "Live content cannot be downloaded"
      );
    }

    return {
      videoId: videoDetails.videoId,
      title: videoDetails.title,
      duration: parseInt(videoDetails.lengthSeconds) || 0,
      thumbnail: videoDetails.thumbnails[0]?.url || "",
      author: videoDetails.author.name,
    };
  } catch (error) {
    if (error instanceof YouTubeDownloadError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Video unavailable") || message.includes("404")) {
      throw new VideoUnavailableError(videoId, "ytdl-core");
    }

    if (message.includes("private") || message.includes("403")) {
      throw new PrivateVideoError(videoId, "ytdl-core");
    }

    if (message.includes("age")) {
      throw new AgeRestrictedError(videoId, "ytdl-core");
    }

    throw new YouTubeDownloadError(
      "unknown_error",
      `Failed to get video info: ${message}`,
      "ytdl-core",
      error as Error
    );
  }
}

/**
 * Download audio from YouTube using ytdl-core
 */
export async function downloadAudio(
  videoId: string,
  outputPath: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const {
    quality = "best",
    format = "m4a",
    maxRetries = 3,
    timeout = 120000, // 2 minutes
  } = options;

  YTDL_LOGGER.info(`Downloading audio for ${videoId} with quality=${quality}`);

  const filename = `${videoId}.${format}`;
  const audioPath = path.join(outputPath, filename);

  // Check if file already exists
  try {
    await fs.access(audioPath);
    const stats = await fs.stat(audioPath);
    if (stats.size > 1000) {
      // File exists and has content
      YTDL_LOGGER.info(`Audio file already exists: ${audioPath}`);
      return {
        success: true,
        audioPath,
        videoId,
        filename,
        provider: "ytdl-core",
      };
    } else {
      // File exists but is empty/corrupt, delete it
      await fs.unlink(audioPath);
    }
  } catch {
    // File doesn't exist, proceed with download
  }

  try {
    // Get video info first to validate video exists
    const info = await withRetry(
      async () => {
        return await ytdl.getInfo(videoId);
      },
      {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          YTDL_LOGGER.warn(
            `Retry ${attempt} for getInfo during download: ${error.message}`
          );
        },
      }
    );

    const duration = parseInt(info.videoDetails.lengthSeconds) || 0;

    // Find best audio format
    const audioFormats = info.formats
      .filter((f) => f.hasAudio && !f.hasVideo)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    if (audioFormats.length === 0) {
      // Fallback to video+audio formats
      const videoFormats = info.formats
        .filter((f) => f.hasAudio)
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

      if (videoFormats.length === 0) {
        throw new NoFormatsError(videoId, "ytdl-core");
      }

      YTDL_LOGGER.warn(
        `No audio-only formats found, using video+audio format`
      );
    }

    // Determine format filter
    let formatFilter: string;
    if (format === "m4a") {
      formatFilter = "bestaudio[ext=m4a]/bestaudio";
    } else if (format === "mp3") {
      formatFilter = "bestaudio[ext=mp3]/bestaudio";
    } else {
      formatFilter = "bestaudio/best";
    }

    YTDL_LOGGER.debug(`Using format filter: ${formatFilter}`);

    // Create download stream with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const readable = ytdl.downloadFromInfo(info, {
        format: formatFilter as unknown as ytdl.videoFormat,
      });

      // Write to file
      await new Promise<void>((resolve, reject) => {
        const writeStream = createWriteStream(audioPath);

        readable.on("error", (err) => {
          YTDL_LOGGER.error(`Readable stream error:`, err);
          writeStream.close();
          reject(err);
        });

        writeStream.on("error", (err) => {
          YTDL_LOGGER.error(`Write stream error:`, err);
          reject(err);
        });

        writeStream.on("finish", () => {
          YTDL_LOGGER.info(`Download completed: ${audioPath}`);
          resolve();
        });

        readable.pipe(writeStream);
      });

      clearTimeout(timeoutId);

      // Verify file was written
      const stats = await fs.stat(audioPath);
      if (stats.size < 1000) {
        throw new YouTubeDownloadError(
          "download_failed",
          "Downloaded file is too small, may be corrupted"
        );
      }

      return {
        success: true,
        audioPath,
        videoId,
        filename,
        duration,
        provider: "ytdl-core",
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new YouTubeDownloadError("timeout", "Download timed out");
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof YouTubeDownloadError) {
      return {
        success: false,
        audioPath,
        videoId,
        filename,
        error: error.toJSON(),
        provider: "ytdl-core",
      };
    }

    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      audioPath,
      videoId,
      filename,
      error: {
        type: "download_failed",
        message: `Download failed: ${message}`,
        provider: "ytdl-core",
        originalError: message,
        retryable: true,
      },
    };
  }
}

/**
 * Audio download orchestrator class
 */
export class AudioDownloadOrchestrator {
  private audioDir: string;

  constructor(audioDir?: string) {
    this.audioDir = audioDir || path.join(process.cwd(), "downloads", "audio");
  }

  /**
   * Ensure download directory exists
   */
  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true });
  }

  /**
   * Download audio with automatic retry
   */
  async download(
    videoId: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    await this.ensureDirectory();

    return withRetry(
      async () => {
        const result = await downloadAudio(videoId, this.audioDir, options);

        // If download failed but error is retryable, throw to trigger retry
        if (!result.success && result.error?.retryable) {
          throw new YouTubeDownloadError(
            result.error.type,
            result.error.message,
            result.error.provider,
            new Error(result.error.originalError)
          );
        }

        return result;
      },
      {
        maxRetries: options.maxRetries || 3,
        onRetry: (attempt, error) => {
          YTDL_LOGGER.warn(`Retry ${attempt} for download: ${error.message}`);
        },
      }
    );
  }

  /**
   * Get video info
   */
  async getInfo(videoId: string): Promise<VideoInfo> {
    return getVideoInfo(videoId);
  }
}
