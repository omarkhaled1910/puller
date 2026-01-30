// Retry logic with exponential backoff

import { YouTubeDownloadError } from "./errors";

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  onRetry: () => {},
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: Required<RetryOptions> = { ...defaultRetryOptions, ...options };

  let lastError: Error = new Error("Unknown error during retry");

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // If this is the last attempt, don't delay
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (error instanceof YouTubeDownloadError && !error.isRetryable()) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay
      );

      // Add some jitter to avoid thundering herd
      const jitter = Math.random() * 200;
      const finalDelay = delay + jitter;

      opts.onRetry(attempt + 1, lastError);

      await sleep(finalDelay);
    }
  }

  throw lastError;
}

/**
 * Create a simple delay
 */
export function delay(ms: number): Promise<void> {
  return sleep(ms);
}
