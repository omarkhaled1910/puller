"use server";

// ============================================================
// Reel Generation Action
// Orchestrates the 3-layer architecture: Mapper -> LLM -> Validator
// ============================================================

import type {
  TranscriptSegment,
  ReelConfig,
  ReelsPlan,
  ReelsError,
} from "@/app/lib/types";
import { mapToLLMInput } from "@/app/lib/llm/mapper";
import { ReelsLLMClient, LLMClientError } from "@/app/lib/llm/client";
import { validateReels } from "@/app/lib/llm/validator";

const REELS_LOGGER = {
  debug: (...args: unknown[]) => console.log("[GenerateReels]", ...args),
  info: (...args: unknown[]) => console.info("[GenerateReels]", ...args),
  warn: (...args: unknown[]) => console.warn("[GenerateReels]", ...args),
  error: (...args: unknown[]) => console.error("[GenerateReels]", ...args),
};

/**
 * Generate reels from a transcript using the 3-layer architecture
 *
 * @param transcript - Array of transcript segments with timestamps
 * @param videoId - YouTube video ID
 * @param config - Optional configuration for reel generation
 * @returns ReelsPlan with generated reel segments or ReelsError
 */
export async function generateReels(
  transcript: TranscriptSegment[],
  videoId: string,
  config: ReelConfig = {}
): Promise<ReelsPlan | ReelsError> {
  try {
    // ============================================================
    // Pre-flight Validation
    // ============================================================

    REELS_LOGGER.info(`Starting reel generation for video ${videoId}`);

    // Check API key based on provider
    const provider = (process.env.LLM_PROVIDER ?? "glm") as "glm" | "claude" | "openai";
    const apiKey =
      provider === "glm"
        ? process.env.GLM_API_KEY
        : provider === "claude"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;

    const keyName =
      provider === "glm"
        ? "GLM_API_KEY"
        : provider === "claude"
        ? "ANTHROPIC_API_KEY"
        : "OPENAI_API_KEY";

    if (!apiKey) {
      return {
        error: "config_error",
        message: `${keyName} environment variable is not configured (set LLM_PROVIDER to switch providers)`,
      };
    }

    // Validate inputs
    if (!transcript || transcript.length === 0) {
      return {
        error: "invalid_input",
        message: "Transcript is empty or invalid",
      };
    }

    if (!videoId || typeof videoId !== "string") {
      return {
        error: "invalid_input",
        message: "Valid video ID is required",
      };
    }

    // Apply default config values
    const finalConfig: Required<ReelConfig> = {
      reelCount: config.reelCount ?? 5,
      minDuration: config.minDuration ?? 30,
      maxDuration: config.maxDuration ?? 60,
      language: config.language ?? "en",
    };

    // ============================================================
    // LAYER 1: MAPPER
    // Transform transcript into LLM-ready input
    // ============================================================

    REELS_LOGGER.info("Layer 1: Mapping transcript to LLM input");

    const mappedInput = mapToLLMInput({
      transcript,
      videoId,
      config: finalConfig,
    });

    REELS_LOGGER.debug(
      `Mapped ${mappedInput.context.segmentCount} segments, ` +
      `total duration: ${mappedInput.context.totalDuration}s`
    );

    // ============================================================
    // LAYER 2: LLM CLIENT
    // Send to Claude API and get response
    // ============================================================

    REELS_LOGGER.info("Layer 2: Calling Claude API");

    let llmResponse: unknown;
    try {
      const client = ReelsLLMClient.fromEnv();
      llmResponse = await client.generateReels(
        mappedInput.systemPrompt,
        mappedInput.userPrompt
      );
    } catch (error) {
      if (error instanceof LLMClientError) {
        return handleLLMError(error);
      }
      throw error;
    }

    // ============================================================
    // LAYER 3: VALIDATOR
    // Validate and filter the LLM response
    // ============================================================

    REELS_LOGGER.info("Layer 3: Validating LLM response");

    let validatedReels: ReturnType<typeof validateReels>;
    try {
      validatedReels = validateReels(
        llmResponse,
        mappedInput.context.totalDuration,
        finalConfig
      );
    } catch (error) {
      // Extract validation errors if available
      let validationErrors: Array<{ path: string; message: string }> | undefined;
      if (error instanceof Error) {
        const match = error.message.match(/LLM response validation failed: (.+)/);
        if (match) {
          // Parse the error message to extract individual errors
          const messages = match[1].split(", ");
          validationErrors = messages.map((msg, idx) => ({
            path: `reels.${idx}`,
            message: msg,
          }));
        }
      }

      // Return error with raw LLM response for debugging
      return {
        error: "validation_error",
        message: error instanceof Error ? error.message : "Failed to validate LLM response",
        rawResponse: llmResponse,
        validationErrors,
      };
    }

    // ============================================================
    // Build Final Response
    // ============================================================

    REELS_LOGGER.info(
      `Successfully generated ${validatedReels.length} reels for video ${videoId}`
    );

    return {
      video_id: videoId,
      config: finalConfig,
      reels: validatedReels,
    };

  } catch (error) {
    // ============================================================
    // Error Handling
    // ============================================================

    REELS_LOGGER.error("Unexpected error in generateReels:", error);

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("api_key") || message.includes("authentication")) {
        return {
          error: "auth_error",
          message: "Invalid API key",
        };
      }

      if (message.includes("rate limit") || message.includes("429")) {
        return {
          error: "rate_limit",
          message: "API rate limit exceeded. Please try again later.",
        };
      }

      if (message.includes("timeout")) {
        return {
          error: "timeout",
          message: "Request timed out. Please try again.",
        };
      }

      return {
        error: "processing_error",
        message: `Failed to generate reels: ${error.message}`,
      };
    }

    return {
      error: "unknown_error",
      message: "An unknown error occurred while generating reels",
    };
  }
}

// ============================================================
// Error Handler Helpers
// ============================================================

function handleLLMError(error: LLMClientError): ReelsError {
  const errorMap: Record<string, { error: string; message: string }> = {
    auth_error: {
      error: "auth_error",
      message: "Invalid Claude API key",
    },
    config_error: {
      error: "config_error",
      message: "LLM client configuration error",
    },
    rate_limit: {
      error: "rate_limit",
      message: "API rate limit exceeded. Please try again later.",
    },
    timeout: {
      error: "timeout",
      message: "Request timed out. Please try again.",
    },
    network_error: {
      error: "network_error",
      message: "Failed to connect to Claude API. Check your network.",
    },
    server_error: {
      error: "server_error",
      message: "Claude API server error. Please try again later.",
    },
    parse_error: {
      error: "parse_error",
      message: "Failed to parse LLM response as JSON",
    },
    invalid_response: {
      error: "invalid_response",
      message: "LLM returned an invalid response format",
    },
  };

  return errorMap[error.code] ?? {
    error: "llm_error",
    message: error.message,
  };
}

// ============================================================
// Re-export types for convenience
// ============================================================

export type { ReelConfig, ReelsPlan, ReelsError, ReelSegment } from "@/app/lib/types";
