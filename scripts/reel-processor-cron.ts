#!/usr/bin/env tsx
// ============================================================
// Reel Processor Cron Job
// Watches downloads/transcripts for new files and generates reels
// ============================================================

import cron from "node-cron";
import { promises as fs } from "fs";
import path from "path";
import { generateReels } from "../app/actions/generateReels";
import type { TranscriptSegment } from "../app/lib/types";
import * as StateTracker from "./state-tracker";

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  transcriptDir: path.join(process.cwd(), "downloads", "transcripts"),
  outputDir: path.join(process.cwd(), "downloads", "processed"),
  cronSchedule: "*/5 * * * *", // Every 5 minutes
  reelConfig: {
    reelCount: 5,
    minDuration: 30,
    maxDuration: 60,
  },
  retryConfig: {
    maxRetries: 3,      // Maximum retry attempts
    retryDelay: 5,      // Minutes between retries
  },
};

const LOGGER = {
  debug: (...args: unknown[]) => console.log("[ReelProcessor]", ...args),
  info: (...args: unknown[]) => console.info("[ReelProcessor]", ...args),
  warn: (...args: unknown[]) => console.warn("[ReelProcessor]", ...args),
  error: (...args: unknown[]) => console.error("[ReelProcessor]", ...args),
};

// ============================================================
// Transcript Parsing
// ============================================================

/**
 * Parse transcript file to extract video ID and segments
 * Supports two formats:
 * 1. JSON3 format (raw from yt-dlp)
 * 2. Plain text format with metadata header
 */
async function parseTranscriptFile(
  filePath: string
): Promise<{ videoId: string; segments: TranscriptSegment[] } | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const filename = path.basename(filePath, ".txt");

    // Try parsing as JSON3 first
    try {
      const jsonData = JSON.parse(content);
      if (jsonData.events) {
        const segments: TranscriptSegment[] = jsonData.events
          .filter((event: any) => event.segs && event.segs.length > 0)
          .map((event: any) => {
            const startMs = event.tStartMs || 0;
            const durationMs = event.dDurationMs || 0;
            const text = event.segs
              .map((seg: any) => seg.utf8 || "")
              .join("")
              .replace(/\n/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            return {
              text,
              duration: durationMs / 1000,
              offset: startMs / 1000,
            };
          })
          .filter((seg: TranscriptSegment) => seg.text.length > 0);

        if (segments.length > 0) {
          return { videoId: filename, segments };
        }
      }
    } catch {
      // Not JSON, continue to text parsing
    }

    // Parse text format with metadata header
    // Expected format:
    // Video Title: [title]
    // Video ID: [id]
    //
    // [timestamp] text...
    const lines = content.split("\n");

    let videoId = filename;
    let segments: TranscriptSegment[] = [];

    // Parse header
    let headerEnd = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line.startsWith("Video ID:")) {
        videoId = line.split(":")[1]?.trim() || filename;
      }
      if (line === "" && i > 0) {
        headerEnd = i + 1;
        break;
      }
    }

    // Parse transcript lines with timestamps
    // Format: [MM:SS] or [HH:MM:SS] text
    const timestampRegex = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)$/;

    for (let i = headerEnd; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(timestampRegex);
      if (match) {
        const [, hrs, mins, secs, text] = match;
        let offset = 0;
        if (secs !== undefined) {
          // HH:MM:SS format
          offset = parseInt(hrs) * 3600 + parseInt(mins) * 60 + parseInt(secs);
        } else {
          // MM:SS format
          offset = parseInt(hrs) * 60 + parseInt(mins);
        }

        // Estimate duration based on text length (rough estimate)
        const wordsPerSecond = 2.5;
        const wordCount = text.split(/\s+/).length;
        const duration = Math.max(1, wordCount / wordsPerSecond);

        segments.push({
          text,
          duration,
          offset,
        });
      }
    }

    // If no timestamps found, try to parse as continuous text
    if (segments.length === 0 && content.length > headerEnd) {
      const fullText = lines.slice(headerEnd).join(" ").trim();
      if (fullText) {
        segments.push({
          text: fullText,
          duration: fullText.split(/\s+/).length / 2.5,
          offset: 0,
        });
      }
    }

    if (segments.length === 0) {
      LOGGER.warn(`No valid transcript segments found in ${filename}`);
      return null;
    }

    return { videoId, segments };

  } catch (error) {
    LOGGER.error(`Error parsing transcript file ${filePath}:`, error);
    return null;
  }
}

// ============================================================
// Processing Logic
// ============================================================

/**
 * Process a single transcript file
 */
async function processTranscript(filePath: string): Promise<void> {
  const filename = path.basename(filePath);

  try {
    LOGGER.info(`Processing transcript: ${filename}`);

    // Parse the transcript
    const parsed = await parseTranscriptFile(filePath);
    if (!parsed) {
      await StateTracker.markProcessed(
        path.basename(filePath, ".txt"),
        filePath,
        "failed",
        undefined,
        "Failed to parse transcript"
      );
      return;
    }

    const { videoId, segments } = parsed;

    // Check if already processed
    const alreadyProcessed = await StateTracker.isProcessed(videoId);
    if (alreadyProcessed) {
      LOGGER.debug(`Skipping ${videoId} - already processed`);
      return;
    }

    LOGGER.info(`Generating reels for ${videoId} (${segments.length} segments)`);

    // Generate reels using the LLM action
    const result = await generateReels(segments, videoId, CONFIG.reelConfig);

    if ("error" in result) {
      LOGGER.error(`Failed to generate reels for ${videoId}:`, result.message);
      await StateTracker.markProcessed(
        videoId,
        filePath,
        "failed",
        undefined,
        result.message
      );
      return;
    }

    // Save output to processed directory
    await ensureOutputDir();
    const outputPath = path.join(CONFIG.outputDir, `${videoId}.json`);
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");

    LOGGER.info(`Successfully processed ${videoId} -> ${outputPath}`);

    // Mark as processed
    await StateTracker.markProcessed(videoId, filePath, "success", outputPath);

  } catch (error) {
    LOGGER.error(`Error processing ${filename}:`, error);
    await StateTracker.markProcessed(
      path.basename(filePath, ".txt"),
      filePath,
      "failed",
      undefined,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
}

/**
 * Scan transcripts directory for new files
 */
async function scanTranscripts(): Promise<void> {
  try {
    LOGGER.info("Scanning transcripts directory...");

    const files = await fs.readdir(CONFIG.transcriptDir);
    const transcriptFiles = files.filter((f) => f.endsWith(".txt"));

    LOGGER.info(`Found ${transcriptFiles.length} transcript files`);

    for (const file of transcriptFiles) {
      const filePath = path.join(CONFIG.transcriptDir, file);
      await processTranscript(filePath);
    }

  } catch (error) {
    LOGGER.error("Error scanning transcripts directory:", error);
  }
}

/**
 * Retry failed jobs that are eligible for retry
 */
async function retryFailedJobs(): Promise<void> {
  try {
    const retryable = await StateTracker.getRetryableProcessings(CONFIG.retryConfig);

    if (retryable.length === 0) {
      LOGGER.debug("No failed jobs to retry");
      return;
    }

    LOGGER.info(`Found ${retryable.length} failed jobs eligible for retry`);

    for (const job of retryable) {
      const remainingRetries = await StateTracker.getRemainingRetries(
        job.videoId,
        CONFIG.retryConfig
      );

      LOGGER.info(
        `Retrying ${job.videoId} (attempt ${job.retryCount ?? 0 + 1}/${CONFIG.retryConfig.maxRetries}, ` +
        `${remainingRetries} retries remaining)`
      );

      // Re-process the transcript
      await processTranscript(job.transcriptPath);
    }

  } catch (error) {
    LOGGER.error("Error retrying failed jobs:", error);
  }
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Start the cron job
 */
export function startCron(): import("node-cron").ScheduledTask {
  LOGGER.info("Starting Reel Processor Cron Job");
  LOGGER.info(`Schedule: ${CONFIG.cronSchedule} (every 5 minutes)`);
  LOGGER.info(`Transcript dir: ${CONFIG.transcriptDir}`);
  LOGGER.info(`Output dir: ${CONFIG.outputDir}`);
  LOGGER.info(`Retry config: maxRetries=${CONFIG.retryConfig.maxRetries}, retryDelay=${CONFIG.retryConfig.retryDelay}min`);

  // Run immediately on start (scan + retry)
  runFullCycle().catch((err) => {
    LOGGER.error("Error in initial cycle:", err);
  });

  // Schedule recurring runs
  const task = cron.schedule(CONFIG.cronSchedule, () => {
    runFullCycle().catch((err) => {
      LOGGER.error("Error in scheduled cycle:", err);
    });
  });

  return task;
}

/**
 * Run full cycle: scan new transcripts + retry failed jobs
 */
async function runFullCycle(): Promise<void> {
  await scanTranscripts();
  await retryFailedJobs();
}

/**
 * Run once and exit (for testing/manual runs)
 */
export async function runOnce(): Promise<void> {
  LOGGER.info("Running single scan...");
  await scanTranscripts();
  await retryFailedJobs();
  LOGGER.info("Scan complete");
}

// ============================================================
// CLI Entry Point
// ============================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || "daemon";

  if (mode === "once") {
    // Run once and exit
    runOnce()
      .then(() => {
        LOGGER.info("Done!");
        process.exit(0);
      })
      .catch((err) => {
        LOGGER.error("Error:", err);
        process.exit(1);
      });
  } else {
    // Run as daemon (continuous)
    startCron();
    LOGGER.info("Cron job is running. Press Ctrl+C to stop.");

    // Keep process alive
    process.on("SIGINT", () => {
      LOGGER.info("Shutting down...");
      process.exit(0);
    });
  }
}
