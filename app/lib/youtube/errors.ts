// Custom error types for YouTube audio downloads

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

export type DownloadProvider = "ytdl-core" | "yt-dlp" | "youtubei";

export interface AudioDownloadError {
  type: AudioErrorType;
  message: string;
  provider?: DownloadProvider;
  originalError?: string;
  retryable?: boolean;
}

export class YouTubeDownloadError extends Error {
  constructor(
    public type: AudioErrorType,
    message: string,
    public provider?: DownloadProvider,
    public originalError?: Error
  ) {
    super(message);
    this.name = "YouTubeDownloadError";
    Object.setPrototypeOf(this, YouTubeDownloadError.prototype);
  }

  isRetryable(): boolean {
    return ["download_failed", "timeout", "rate_limit", "no_formats"].includes(
      this.type
    );
  }

  toJSON(): AudioDownloadError {
    return {
      type: this.type,
      message: this.message,
      provider: this.provider,
      originalError: this.originalError?.message,
      retryable: this.isRetryable(),
    };
  }
}

export class VideoUnavailableError extends YouTubeDownloadError {
  constructor(videoId: string, provider?: DownloadProvider) {
    super(
      "video_unavailable",
      `Video ${videoId} is unavailable or does not exist`,
      provider
    );
    this.name = "VideoUnavailableError";
    Object.setPrototypeOf(this, VideoUnavailableError.prototype);
  }
}

export class NoFormatsError extends YouTubeDownloadError {
  constructor(videoId: string, provider?: DownloadProvider) {
    super(
      "no_formats",
      `No matching audio formats found for video ${videoId}`,
      provider
    );
    this.name = "NoFormatsError";
    Object.setPrototypeOf(this, NoFormatsError.prototype);
  }
}

export class PrivateVideoError extends YouTubeDownloadError {
  constructor(videoId: string, provider?: DownloadProvider) {
    super("private_video", `Video ${videoId} is private`, provider);
    this.name = "PrivateVideoError";
    Object.setPrototypeOf(this, PrivateVideoError.prototype);
  }
}

export class AgeRestrictedError extends YouTubeDownloadError {
  constructor(videoId: string, provider?: DownloadProvider) {
    super("age_restricted", `Video ${videoId} is age restricted`, provider);
    this.name = "AgeRestrictedError";
    Object.setPrototypeOf(this, AgeRestrictedError.prototype);
  }
}

export class ValidationError extends YouTubeDownloadError {
  constructor(message: string) {
    super("validation_error", message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
