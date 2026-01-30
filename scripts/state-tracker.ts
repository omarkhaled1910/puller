// ============================================================
// State Tracker for Processed Videos
// Tracks which transcripts have been processed by the LLM
// ============================================================

import { promises as fs } from "fs";
import path from "path";

const STATE_DIR = path.join(process.cwd(), "downloads", "state");
const STATE_FILE = path.join(STATE_DIR, "processed.json");

export interface ProcessedState {
  videoId: string;
  transcriptPath: string;
  processedAt: string;
  status: "success" | "failed";
  error?: string;
  outputPath?: string;
  retryCount?: number;      // Number of times this has been retried
  lastRetryAt?: string;     // When the last retry was attempted
}

export interface StateData {
  processed: ProcessedState[];
  lastUpdated: string;
}

const STATE_LOGGER = {
  debug: (...args: unknown[]) => console.log("[StateTracker]", ...args),
  info: (...args: unknown[]) => console.info("[StateTracker]", ...args),
  warn: (...args: unknown[]) => console.warn("[StateTracker]", ...args),
  error: (...args: unknown[]) => console.error("[StateTracker]", ...args),
};

/**
 * Ensure state directory exists
 */
async function ensureStateDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

/**
 * Read the state file
 */
async function readState(): Promise<StateData> {
  try {
    const content = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    // File doesn't exist or is invalid, return default
    return {
      processed: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Write the state file
 */
async function writeState(data: StateData): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Check if a video has been processed
 */
export async function isProcessed(videoId: string): Promise<boolean> {
  const state = await readState();
  return state.processed.some((p) => p.videoId === videoId);
}

/**
 * Mark a video as processed
 */
export async function markProcessed(
  videoId: string,
  transcriptPath: string,
  status: "success" | "failed",
  outputPath?: string,
  error?: string
): Promise<void> {
  const state = await readState();

  // Check if this is a retry (existing failed entry)
  const existing = state.processed.find((p) => p.videoId === videoId);
  let retryCount = 0;

  if (existing && existing.status === "failed" && status === "failed") {
    // This is a retry attempt
    retryCount = (existing.retryCount ?? 0) + 1;
  }

  // Remove any existing entry for this video
  state.processed = state.processed.filter((p) => p.videoId !== videoId);

  // Add new entry
  state.processed.push({
    videoId,
    transcriptPath,
    processedAt: new Date().toISOString(),
    status,
    outputPath,
    error,
    retryCount: retryCount > 0 ? retryCount : undefined,
    lastRetryAt: retryCount > 0 ? new Date().toISOString() : undefined,
  });

  state.lastUpdated = new Date().toISOString();

  await writeState(state);
  STATE_LOGGER.info(`Marked ${videoId} as ${status}${retryCount > 0 ? ` (retry #${retryCount})` : ""}`);
}

/**
 * Get list of all processed videos
 */
export async function getProcessedVideos(): Promise<ProcessedState[]> {
  const state = await readState();
  return state.processed;
}

/**
 * Get list of failed processings
 */
export async function getFailedProcessings(): Promise<ProcessedState[]> {
  const state = await readState();
  return state.processed.filter((p) => p.status === "failed");
}

/**
 * Clear all state (useful for testing)
 */
export async function clearState(): Promise<void> {
  const emptyState: StateData = {
    processed: [],
    lastUpdated: new Date().toISOString(),
  };
  await writeState(emptyState);
  STATE_LOGGER.info("State cleared");
}

/**
 * Remove a video from processed state (allows re-processing)
 */
export async function removeFromProcessed(videoId: string): Promise<boolean> {
  const state = await readState();
  const initialLength = state.processed.length;
  state.processed = state.processed.filter((p) => p.videoId !== videoId);

  if (state.processed.length < initialLength) {
    state.lastUpdated = new Date().toISOString();
    await writeState(state);
    STATE_LOGGER.info(`Removed ${videoId} from processed state`);
    return true;
  }

  return false;
}

// ============================================================
// Retry Functions
// ============================================================

export interface RetryConfig {
  maxRetries?: number;       // Maximum number of retries (default: 3)
  retryDelay?: number;        // Delay between retries in minutes (default: 5)
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 5,
};

/**
 * Get failed processings that are eligible for retry
 * Filters by retry count and time since last retry
 */
export async function getRetryableProcessings(
  config: RetryConfig = {}
): Promise<ProcessedState[]> {
  const state = await readState();
  const { maxRetries, retryDelay } = { ...DEFAULT_RETRY_CONFIG, ...config };

  const now = Date.now();
  const retryDelayMs = retryDelay * 60 * 1000;

  return state.processed.filter((p) => {
    if (p.status !== "failed") return false;

    // Check retry count
    const retryCount = p.retryCount ?? 0;
    if (retryCount >= maxRetries) return false;

    // Check time since last retry
    if (p.lastRetryAt) {
      const lastRetryTime = new Date(p.lastRetryAt).getTime();
      const timeSinceRetry = now - lastRetryTime;
      if (timeSinceRetry < retryDelayMs) return false;
    }

    return true;
  });
}

/**
 * Check if a specific video can be retried
 */
export async function canRetry(videoId: string, config: RetryConfig = {}): Promise<boolean> {
  const state = await readState();
  const entry = state.processed.find((p) => p.videoId === videoId);

  if (!entry || entry.status !== "failed") return false;

  const { maxRetries, retryDelay } = { ...DEFAULT_RETRY_CONFIG, ...config };
  const now = Date.now();
  const retryDelayMs = retryDelay * 60 * 1000;

  const retryCount = entry.retryCount ?? 0;
  if (retryCount >= maxRetries) return false;

  if (entry.lastRetryAt) {
    const lastRetryTime = new Date(entry.lastRetryAt).getTime();
    const timeSinceRetry = now - lastRetryTime;
    if (timeSinceRetry < retryDelayMs) return false;
  }

  return true;
}

/**
 * Get count of remaining retries for a video
 */
export async function getRemainingRetries(
  videoId: string,
  config: RetryConfig = {}
): Promise<number> {
  const state = await readState();
  const entry = state.processed.find((p) => p.videoId === videoId);

  if (!entry || entry.status !== "failed") {
    return config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
  }

  const { maxRetries = DEFAULT_RETRY_CONFIG.maxRetries } = config;
  const retryCount = entry.retryCount ?? 0;
  return Math.max(0, maxRetries - retryCount);
}
