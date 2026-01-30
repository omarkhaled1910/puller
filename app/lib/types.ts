// Type definitions for the YouTube Clipper app

export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
}

export interface ClipSegment {
  segment_id: number;
  start: number; // seconds
  end: number;   // seconds
  arabic_title: string;
  arabic_summary: string;
  key_points_translated: string[];
}

export interface ClipPlan {
  video_id: string;
  segments: ClipSegment[];
}

export interface TranscriptError {
  error: string;
  message: string;
}

export interface ClipPlanError {
  error: string;
  message: string;
}

// Audio and Transcript types
export type DownloadProvider = "ytdl-core" | "yt-dlp" | "youtubei";

export type AudioErrorType =
  | "validation_error"
  | "video_unavailable"
  | "no_formats"
  | "download_failed"
  | "timeout"
  | "rate_limit"
  | "age_restricted"
  | "region_restricted"
  | "private_video"
  | "unknown_error";

export interface AudioDownloadErrorDetail {
  type: AudioErrorType;
  message: string;
  provider?: DownloadProvider;
  originalError?: string;
  retryable?: boolean;
}

export interface AudioDownloadResult {
  success: boolean;
  audioPath: string;
  videoId: string;
  filename: string;
  duration?: number;
  provider?: DownloadProvider;
  error?: AudioDownloadErrorDetail;
}

export interface TranscriptWithTimestamps {
  videoId: string;
  videoTitle: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    startTime: string; // formatted as MM:SS
    endTime: string;   // formatted as MM:SS
  }>;
  fullText: string;
  transcriptPath: string;
}

export interface AudioTranscriptResult {
  audio: AudioDownloadResult;
  transcript: TranscriptWithTimestamps;
}

// ============================================================
// Reel Generation Types
// ============================================================

export interface ReelConfig {
  reelCount?: number;        // Default: 5
  minDuration?: number;      // Default: 30 seconds
  maxDuration?: number;      // Default: 60 seconds
  language?: string;         // Default: "en"
}

export interface ReelSegment {
  reel_id: number;
  start: number;        // seconds
  end: number;          // seconds
  title: string;
  summary: string;
  hook: string;
  confidence: number;
  duration: number;     // calculated (end - start)
}

export interface ReelsPlan {
  video_id: string;
  config: ReelConfig;
  reels: ReelSegment[];
}

export interface ReelsError {
  error: string;
  message: string;
}

// ============================================================
// LLM Layer Types
// ============================================================

export interface MapperInput {
  transcript: TranscriptSegment[];
  videoId: string;
  config: ReelConfig;
}

export interface MappedOutput {
  systemPrompt: string;
  userPrompt: string;
  context: {
    totalDuration: number;
    segmentCount: number;
  };
}

export interface LLMClientConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}
