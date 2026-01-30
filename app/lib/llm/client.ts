// ============================================================
// LAYER 2: LLM CLIENT
// Handles communication with LLM APIs (GLM-4, Claude, OpenAI, etc.)
// Uses OpenAI-compatible protocol
// ============================================================

import OpenAI from "openai";
import jwt from "jsonwebtoken";
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
// Zhipu AI JWT Token Generation
// ============================================================

interface CachedToken {
  token: string;
  exp: number;
}

function generateToken(apiKey: string, timestamp: number, ttl: number): string {
  const [id, secret] = apiKey.split(".");
  const exp = Math.floor(timestamp / 1000) + Math.floor(ttl / 1000);

  // Use a workaround to add custom header for Zhipu AI
  const token = jwt.sign(
    {
      api_key: id,
      exp,
      timestamp: Math.floor(timestamp / 1000),
    },
    secret,
    { algorithm: "HS256" }
  );

  // Inject sign_type into the header manually
  const [headerB64, payloadB64, signature] = token.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64").toString());
  header.sign_type = "SIGN";
  const newHeaderB64 = Buffer.from(JSON.stringify(header)).toString("base64url");

  return `${newHeaderB64}.${payloadB64}.${signature}`;
}

class ZhipuAIAuthManager {
  private cachedToken: CachedToken | null = null;
  private readonly options = {
    tokenTTL: 3 * 60 * 1000, // 3 minutes
    tokenRefreshTTL: 30 * 1000, // Refresh 30 seconds before expiry
  };

  getToken(apiKey: string): string {
    // Check if we have a cached token that's still valid
    if (
      this.cachedToken &&
      this.cachedToken.exp - this.options.tokenRefreshTTL > Date.now()
    ) {
      return this.cachedToken.token;
    }

    // Generate a new token
    this.cachedToken = null;
    const now = Date.now();
    const token = generateToken(apiKey, now, this.options.tokenTTL);
    this.cachedToken = {
      token,
      exp: now + this.options.tokenTTL,
    };
    return this.cachedToken.token;
  }
}

const zhipuAuthManager = new ZhipuAIAuthManager();

// ============================================================
// Provider Configurations
// ============================================================

type Provider = "glm" | "claude" | "openai" | "custom";

interface ProviderConfig {
  baseURL: string;
  defaultModel: string;
  supportsSystemMessage: boolean;
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  // GLM-4 (Zhipu AI)
  glm: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4/",
    defaultModel: "glm-4.5", // Valid models: glm-4.5, glm-4.7, glm-4-plus, glm-4-long
    supportsSystemMessage: true,
  },

  // Claude (via any OpenAI-compatible proxy)
  claude: {
    baseURL: "https://api.anthropic.com/v1/",
    defaultModel: "claude-3-5-sonnet-20241022",
    supportsSystemMessage: true,
  },

  // OpenAI
  openai: {
    baseURL: "https://api.openai.com/v1/",
    defaultModel: "gpt-4o-mini",
    supportsSystemMessage: true,
  },

  // Custom endpoint
  custom: {
    baseURL: "",
    defaultModel: "",
    supportsSystemMessage: true,
  },
};

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: Partial<LLMClientConfig> = {
  provider: "glm",
  model: "glm-4.5",
  temperature: 0.7,
  maxTokens: 4000,
};

// ============================================================
// Client Class
// ============================================================

export class ReelsLLMClient {
  private client: OpenAI;
  private config: LLMClientConfig & { provider: Provider };
  private providerConfig: ProviderConfig;
  private provider: Provider;

  constructor(config: LLMClientConfig & { provider?: Provider }) {
    this.provider = (config.provider ?? "glm") as Provider;
    this.config = { ...DEFAULT_CONFIG, ...config, provider: this.provider };

    if (!this.config.apiKey) {
      throw new LLMClientError(
        "API key is required",
        "config_error"
      );
    }

    // Get provider configuration
    this.providerConfig = PROVIDER_CONFIGS[this.provider];

    // For GLM, generate JWT token; for others, use API key directly
    const authKey = this.provider === "glm"
      ? zhipuAuthManager.getToken(this.config.apiKey)
      : this.config.apiKey;

    // Initialize OpenAI client (works with any OpenAI-compatible API)
    this.client = new OpenAI({
      apiKey: authKey,
      baseURL: this.config.baseURL ?? this.providerConfig.baseURL,
    });

    LLM_LOGGER.info(
      `LLM Client initialized: provider=${this.provider}, model=${this.config.model}`
    );
  }

  /**
   * Generate reels from transcript using configured LLM
   * @param systemPrompt - System prompt defining the LLM's role
   * @param userPrompt - User prompt with transcript and requirements
   * @returns Parsed JSON response from the LLM
   */
  async generateReels(
    systemPrompt: string,
    userPrompt: string
  ): Promise<unknown> {
    LLM_LOGGER.info("Sending request to LLM API");

    try {
      // Build messages based on provider support
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ];

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 4000,
      });

      // Extract the response content
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new LLMClientError(
          "Empty response from LLM",
          "invalid_response"
        );
      }

      LLM_LOGGER.debug(`LLM response length: ${content.length} chars`);

      // Parse JSON from response
      const parsed = this.parseJSONResponse(content);

      LLM_LOGGER.info("Successfully parsed LLM response");

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
    } catch { }

    // Try extracting JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch { }
    }

    // Try extracting just the JSON object (find first { to last })
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { }
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
    LLM_LOGGER.error("LLM API error:", error);

    if (error instanceof OpenAI.APIError) {
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
          "LLM API server error. Please try again later.",
          "server_error",
          error
        );
      }

      throw new LLMClientError(
        `LLM API error: ${message}`,
        "api_error",
        error
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
        throw new LLMClientError(
          "Failed to connect to LLM API. Check your network connection.",
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
      "Unknown error occurred while calling LLM API",
      "unknown_error",
      error
    );
  }

  /**
   * Create a client from environment variables
   * Utility method for easy initialization
   */
  static fromEnv(): ReelsLLMClient {
    // Provider from env, default to glm
    const provider = (process.env.LLM_PROVIDER ?? "glm") as Provider;

    // API key based on provider
    const apiKey =
      provider === "glm"
        ? process.env.GLM_API_KEY
        : provider === "claude"
          ? process.env.ANTHROPIC_API_KEY
          : provider === "openai"
            ? process.env.OPENAI_API_KEY
            : process.env.LLM_API_KEY;

    if (!apiKey) {
      const keyName =
        provider === "glm"
          ? "GLM_API_KEY"
          : provider === "claude"
            ? "ANTHROPIC_API_KEY"
            : provider === "openai"
              ? "OPENAI_API_KEY"
              : "LLM_API_KEY";

      throw new LLMClientError(
        `${keyName} environment variable is not set`,
        "config_error"
      );
    }

    return new ReelsLLMClient({
      provider,
      apiKey,
      model: process.env.REELS_MODEL ?? PROVIDER_CONFIGS[provider].defaultModel,
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
export async function generateReelsWithLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const client = ReelsLLMClient.fromEnv();
  return client.generateReels(systemPrompt, userPrompt);
}