// ============================================================
// LAYER 1: MAPPER
// Transforms transcript data into LLM-ready input format
// ============================================================

import type {
  TranscriptSegment,
  MapperInput,
  MappedOutput,
  ReelConfig,
} from "@/app/lib/types";

const MAPPER_LOGGER = {
  debug: (...args: unknown[]) => console.log("[Mapper]", ...args),
  info: (...args: unknown[]) => console.info("[Mapper]", ...args),
  warn: (...args: unknown[]) => console.warn("[Mapper]", ...args),
  error: (...args: unknown[]) => console.error("[Mapper]", ...args),
};

/**
 * Format seconds to readable timestamp (MM:SS or HH:MM:SS)
 */
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format transcript segments with timestamps for LLM consumption
 * Creates a readable format that preserves timing information
 */
function formatTranscriptWithTimestamps(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${formatTime(seg.offset)}] ${seg.text}`)
    .join("\n");
}

/**
 * Calculate total video duration from transcript segments
 */
function calculateTotalDuration(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  const lastSegment = segments[segments.length - 1];
  return lastSegment.offset + lastSegment.duration;
}

/**
 * Build the system prompt for the LLM
 * Defines the LLM's role and output requirements
 */
function buildSystemPrompt(config: ReelConfig): string {
  const reelCount = config.reelCount ?? 5;
  const minDuration = config.minDuration ?? 30;
  const maxDuration = config.maxDuration ?? 60;

  return `You are an expert content editor specializing in short-form video content.
Your task is to analyze video transcripts and identify the best segments for creating viral social media reels.

CRITICAL DURATION REQUIREMENTS:
- Each segment MUST be between ${minDuration} and ${maxDuration} seconds long
- Calculate duration as: end_time - start_time
- EXAMPLE: start=0, end=45 → duration = 45 seconds ✓
- EXAMPLE: start=0, end=15 → duration = 15 seconds ✗ TOO SHORT
- EXAMPLE: start=120, end=195 → duration = 75 seconds ✗ TOO LONG

IMPORTANT RULES:
1. Identify exactly ${reelCount} distinct segments that would work well as standalone reels
2. Each segment MUST be ${minDuration}-${maxDuration} seconds - this is non-negotiable
3. Segments must NOT overlap
4. Each segment should have a strong hook at the beginning (under 200 characters)
5. Prioritize segments with: surprising insights, emotional impact, or clear value
6. Return ONLY valid JSON, no additional text or explanation

OUTPUT FORMAT (JSON only):
{
  "reels": [
    {
      "reel_id": 1,
      "start": <start_time_in_seconds>,
      "end": <end_time_in_seconds>,
      "title": "<catchy title for the reel>",
      "summary": "<1-2 sentence summary of what makes this segment engaging>",
      "hook": "<the exact opening phrase or moment that grabs attention - keep it under 200 characters>",
      "confidence": <0.0 to 1.0 score indicating how strong this segment is>
    }
  ]
}

CONFIDENCE SCORING:
- 0.9-1.0: Exceptional - highly engaging, viral potential
- 0.7-0.9: Strong - good content, likely to perform well
- 0.5-0.7: Moderate - acceptable, but not outstanding
- Below 0.5: Weak - avoid if possible`;
}

/**
 * Build the user prompt with transcript and context
 */
function buildUserPrompt(
  transcript: string,
  videoId: string,
  totalDuration: number,
  segmentCount: number,
  config: ReelConfig
): string {
  const reelCount = config.reelCount ?? 5;
  const minDuration = config.minDuration ?? 30;
  const maxDuration = config.maxDuration ?? 60;

  return `Analyze this transcript and identify ${reelCount} segments for social media reels.

VIDEO INFORMATION:
- Video ID: ${videoId}
- Total Duration: ${formatTime(totalDuration)} (${Math.round(totalDuration)} seconds)
- Transcript Segments: ${segmentCount}

CRITICAL DURATION REQUIREMENTS - READ CAREFULLY:
- Each segment MUST be between ${minDuration} and ${maxDuration} seconds
- Duration = end - start
- Valid examples: (start=0, end=${minDuration}) = ${minDuration}s ✓ | (start=100, end=${100 + maxDuration}) = ${maxDuration}s ✓
- Invalid examples: (start=0, end=20) = 20s ✗ TOO SHORT | (start=0, end=90) = 90s ✗ TOO LONG
- If you output segments outside ${minDuration}-${maxDuration} seconds, they will be REJECTED

REQUIREMENTS:
- Create exactly ${reelCount} segments
- Each segment MUST be ${minDuration}-${maxDuration} seconds (non-negotiable)
- Segments must be sequential and non-overlapping
- Focus on engaging, shareable moments
- Assign confidence scores based on viral potential
- Hooks must be under 200 characters

TRANSCRIPT WITH TIMESTAMPS:
${transcript}

Return only valid JSON with the reels array.`;
}

/**
 * Main mapper function
 * Transforms raw transcript and config into LLM-ready prompts
 */
export function mapToLLMInput(input: MapperInput): MappedOutput {
  const { transcript, videoId, config } = input;

  // Validate input
  if (!transcript || transcript.length === 0) {
    throw new Error("Transcript is empty or invalid");
  }

  if (!videoId || typeof videoId !== "string") {
    throw new Error("Valid video ID is required");
  }

  MAPPER_LOGGER.info(`Mapping transcript for video ${videoId}`);

  // Calculate context
  const totalDuration = calculateTotalDuration(transcript);
  const segmentCount = transcript.length;

  // Format transcript for LLM
  const formattedTranscript = formatTranscriptWithTimestamps(transcript);

  // Build prompts
  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(
    formattedTranscript,
    videoId,
    totalDuration,
    segmentCount,
    config
  );

  MAPPER_LOGGER.debug(
    `Mapped ${segmentCount} segments, total duration: ${formatTime(totalDuration)}`
  );

  return {
    systemPrompt,
    userPrompt,
    context: {
      totalDuration,
      segmentCount,
    },
  };
}

/**
 * Format time for display (utility function)
 */
export { formatTime };
