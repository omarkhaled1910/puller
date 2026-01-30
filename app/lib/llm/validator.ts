// ============================================================
// LAYER 3: VALIDATOR
// Validates LLM output with Zod schemas and business rules
// ============================================================

import { z } from "zod";
import type { ReelSegment, ReelConfig } from "@/app/lib/types";

const VALIDATOR_LOGGER = {
  debug: (...args: unknown[]) => console.log("[Validator]", ...args),
  info: (...args: unknown[]) => console.info("[Validator]", ...args),
  warn: (...args: unknown[]) => console.warn("[Validator]", ...args),
  error: (...args: unknown[]) => console.error("[Validator]", ...args),
};

// ============================================================
// Zod Schemas
// ============================================================

/**
 * Schema for a single reel segment from LLM (without calculated duration)
 * The duration is added later during validation
 */
const LLMReelSegmentSchema = z.object({
  reel_id: z.number().int().positive("Reel ID must be a positive integer"),
  start: z.number().nonnegative("Start time must be non-negative"),
  end: z.number().nonnegative("End time must be non-negative"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  summary: z.string().min(1, "Summary is required").max(500, "Summary too long"),
  hook: z.string().min(1, "Hook is required").max(100, "Hook too long"),
  confidence: z.number().min(0, "Confidence must be between 0 and 1").max(1, "Confidence must be between 0 and 1"),
});

// Infer type from schema
type LLMReelSegment = z.infer<typeof LLMReelSegmentSchema>;

/**
 * Schema for the complete LLM response
 */
const ReelsResponseSchema = z.object({
  reels: z.array(LLMReelSegmentSchema).min(1, "At least one reel is required"),
});

// ============================================================
// Validation Functions
// ============================================================

/**
 * Check if a segment's duration is within bounds
 */
function isDurationValid(
  segment: ReelSegment,
  config: ReelConfig
): boolean {
  const duration = segment.end - segment.start;
  const minDuration = config.minDuration ?? 30;
  const maxDuration = config.maxDuration ?? 60;

  return duration >= minDuration && duration <= maxDuration;
}

/**
 * Check if a segment is within video duration bounds
 */
function isWithinBounds(
  segment: ReelSegment,
  videoDuration: number
): boolean {
  return segment.start < videoDuration && segment.end <= videoDuration;
}

/**
 * Check if two segments overlap
 */
function segmentsOverlap(a: ReelSegment, b: ReelSegment): boolean {
  return !(a.end <= b.start || a.start >= b.end);
}

/**
 * Check if any segments in the array overlap
 */
function hasOverlappingSegments(segments: ReelSegment[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsOverlap(segments[i], segments[j])) {
        VALIDATOR_LOGGER.warn(
          `Overlap detected: reel ${segments[i].reel_id} (${segments[i].start}-${segments[i].end}) ` +
          `and reel ${segments[j].reel_id} (${segments[j].start}-${segments[j].end})`
        );
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate duration for a segment (end - start)
 */
function calculateDuration(segment: ReelSegment): number {
  return segment.end - segment.start;
}

// ============================================================
// Main Validation Functions
// ============================================================

/**
 * Validate the raw LLM response against Zod schema
 * Returns parsed data or throws error
 * Note: Returns LLM format segments without duration field
 */
function validateLLMResponse(rawResponse: unknown): {
  reels: LLMReelSegment[];
} {
  VALIDATOR_LOGGER.info("Validating LLM response structure");

  const result = ReelsResponseSchema.safeParse(rawResponse);

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));

    VALIDATOR_LOGGER.error("Zod validation failed:", errors);

    throw new Error(
      `LLM response validation failed: ${errors.map((e) => e.message).join(", ")}`
    );
  }

  VALIDATOR_LOGGER.info(`Validated ${result.data.reels.length} reel segments`);
  return result.data;
}

/**
 * Apply business rule validations to the parsed segments
 * Filters out invalid segments and adds computed fields
 * Converts LLM format segments to full ReelSegment with duration
 */
function validateSegmentBusinessRules(
  segments: LLMReelSegment[],
  videoDuration: number,
  config: ReelConfig
): ReelSegment[] {
  VALIDATOR_LOGGER.info("Applying business rule validations");

  const validatedSegments: ReelSegment[] = [];

  for (const segment of segments) {
    let isValid = true;

    // Check duration bounds
    const segmentDuration = segment.end - segment.start;
    if (!isDurationValid({ ...segment, duration: segmentDuration }, config)) {
      VALIDATOR_LOGGER.warn(
        `Reel ${segment.reel_id}: Duration ${segmentDuration}s is outside bounds ` +
        `(${config.minDuration ?? 30}-${config.maxDuration ?? 60}s)`
      );
      isValid = false;
    }

    // Check video duration bounds
    if (!isWithinBounds({ ...segment, duration: segmentDuration }, videoDuration)) {
      VALIDATOR_LOGGER.warn(
        `Reel ${segment.reel_id}: Timestamps exceed video duration (${videoDuration}s)`
      );
      isValid = false;
    }

    // Check logical consistency (start < end)
    if (segment.start >= segment.end) {
      VALIDATOR_LOGGER.warn(
        `Reel ${segment.reel_id}: Start (${segment.start}) must be before end (${segment.end})`
      );
      isValid = false;
    }

    if (isValid) {
      // Add computed duration field and convert to full ReelSegment
      validatedSegments.push({
        reel_id: segment.reel_id,
        start: segment.start,
        end: segment.end,
        title: segment.title,
        summary: segment.summary,
        hook: segment.hook,
        confidence: segment.confidence,
        duration: segmentDuration,
      });
    }
  }

  // Check for overlaps
  if (hasOverlappingSegments(validatedSegments)) {
    VALIDATOR_LOGGER.warn("Some reels have overlapping timestamps");
    // Optionally: filter out overlapping segments or keep them
    // For now, we'll keep them but log a warning
  }

  VALIDATOR_LOGGER.info(
    `Business validation complete: ${validatedSegments.length}/${segments.length} segments passed`
  );

  return validatedSegments;
}

/**
 * Comprehensive validation function
 * Combines schema validation and business rule validation
 */
export function validateReels(
  rawResponse: unknown,
  videoDuration: number,
  config: ReelConfig
): ReelSegment[] {
  // Step 1: Validate JSON structure
  const parsed = validateLLMResponse(rawResponse);

  // Step 2: Apply business rules
  const validated = validateSegmentBusinessRules(
    parsed.reels,
    videoDuration,
    config
  );

  if (validated.length === 0) {
    throw new Error("No valid reels remaining after validation");
  }

  return validated;
}

// ============================================================
// Error Types
// ============================================================

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Wrap validation with try-catch for consistent error handling
 */
export function safeValidateReels(
  rawResponse: unknown,
  videoDuration: number,
  config: ReelConfig
): { success: true; reels: ReelSegment[] } | { success: false; error: string } {
  try {
    const reels = validateReels(rawResponse, videoDuration, config);
    return { success: true, reels };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unknown validation error" };
  }
}
