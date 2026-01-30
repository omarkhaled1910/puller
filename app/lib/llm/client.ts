// ============================================================
// LAYER 2: LLM CLIENT
// Handles communication with Claude API
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { LLMClientConfig } from "@/app/lib/types";

const LLM_LOGGER = {
  debug: (...args: unknown[]) => console.log("[LLM Client]", ...args),
  info: (...args: unknown[]) => console.info("[LLM Client]", ...args),
  warn: (...args: unknown[]) => console.warn("[LLM Client]", ...args),
  error: (...args: unknown[]) => console.error("[LLM Client]", ...args),
};

// ============================================================
// Error Types
// ============================================================

export class LLMClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "LLMClientError";
  }
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: Partial<LLMClientConfig> = {
  model: "claude-3-5-sonnet-20241022", // or claude-3-5-sonnet-20240620
  temperature: 0.7,
  maxTokens: 4000,
};

// ============================================================
// Client Class
// ============================================================

export class ReelsLLMClient {
  private client: Anthropic;
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.apiKey) {
      throw new LLMClientError(
        "API key is required",
        "config_error"
      );
    }

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

    LLM_LOGGER.info(`LLM Client initialized with model: ${this.config.model}`);
  }

  /**
   * Generate reels from transcript using Claude
   * @param systemPrompt - System prompt defining the LLM's role
   * @param userPrompt - User prompt with transcript and requirements
   * @returns Parsed JSON response from the LLM
   */
  async generateReels(
    systemPrompt: string,
    userPrompt: string
  ): Promise<unknown> {
    LLM_LOGGER.info("Sending request to Claude API");

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 4000,
        temperature: this.config.temperature ?? 0.7,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      // Extract the response content
      const contentBlock = response.content[0];

      if (contentBlock.type !== "text") {
        throw new LLMClientError(
          "Unexpected response type from Claude",
          "invalid_response"
        );
      }

      const responseText = contentBlock.text;

      LLM_LOGGER.debug(`Claude response length: ${responseText.length} chars`);

      // Parse JSON from response
      // Claude may include markdown code blocks, so we need to extract JSON
      const parsed = this.parseJSONResponse(responseText);

      LLM_LOGGER.info("Successfully parsed Claude response");

      return parsed;

    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Parse JSON from LLM response
   * Handles various response formats (plain JSON, markdown code blocks, etc.)
   */
  private parseJSONResponse(responseText: string): unknown {
    // Try parsing as-is first
    try {
      return JSON.parse(responseText);
    } catch {}

    // Try extracting JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {}
    }

    // Try extracting just the JSON object (find first { to last })
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }

    throw new LLMClientError(
      "Could not extract valid JSON from LLM response",
      "parse_error"
    );
  }

  /**
   * Handle errors from the API
   */
  private handleError(error: unknown): never {
    LLM_LOGGER.error("Claude API error:", error);

    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 401 || status === 403) {
        throw new LLMClientError(
          "Invalid API key or authentication failed",
          "auth_error",
          error
        );
      }

      if (status === 429) {
        throw new LLMClientError(
          "API rate limit exceeded. Please try again later.",
          "rate_limit",
          error
        );
      }

      if (status === 400) {
        throw new LLMClientError(
          `Bad request: ${message}`,
          "bad_request",
          error
        );
      }

      if (status && status >= 500) {
        throw new LLMClientError(
          "Claude API server error. Please try again later.",
          "server_error",
          error
        );
      }

      throw new LLMClientError(
        `Claude API error: ${message}`,
        "api_error",
        error
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
        throw new LLMClientError(
          "Failed to connect to Claude API. Check your network connection.",
          "network_error",
          error
        );
      }

      if (error.message.includes("timeout")) {
        throw new LLMClientError(
          "Request timed out. Please try again.",
          "timeout",
          error
        );
      }
    }

    throw new LLMClientError(
      "Unknown error occurred while calling Claude API",
      "unknown_error",
      error
    );
  }

  /**
   * Create a client from environment variables
   * Utility method for easy initialization
   */
  static fromEnv(): ReelsLLMClient {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new LLMClientError(
        "ANTHROPIC_API_KEY environment variable is not set",
        "config_error"
      );
    }

    return new ReelsLLMClient({
      apiKey,
      model: process.env.REELS_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxTokens: 4000,
    });
  }
}

// ============================================================
// Convenience Function
// ============================================================

/**
 * Quick way to generate reels using environment configuration
 */
export async function generateReelsWithClaude(
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const client = ReelsLLMClient.fromEnv();
  return client.generateReels(systemPrompt, userPrompt);
}
