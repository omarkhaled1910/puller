"use server";

import OpenAI from "openai";
import type { TranscriptSegment, ClipSegment, ClipPlanError, ClipPlan } from "@/app/lib/types";
import { z } from "zod";

// Zod schema for validating clip segment output
const ClipSegmentSchema = z.object({
  segment_id: z.number(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  arabic_title: z.string(),
  arabic_summary: z.string(),
  key_points_translated: z.array(z.string()),
});

const ClipPlanResponseSchema = z.object({
  segments: z.array(ClipSegmentSchema),
});

/**
 * Format transcript segments into readable text for LLM processing
 * Includes timestamp information for reference
 */
function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, idx) => `[${formatTime(seg.offset)}] ${seg.text}`)
    .join("\n");
}

/**
 * Convert seconds to readable timestamp format (MM:SS)
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Generate a structured clip plan from transcript using OpenAI GPT-4o-mini
 * @param transcript - Array of transcript segments
 * @param videoId - YouTube video ID for reference
 * @returns ClipPlan with 3 segments or error object
 */
export async function generateClipPlan(
  transcript: TranscriptSegment[],
  videoId: string
): Promise<ClipPlan | ClipPlanError> {
  try {
    // Validate environment variable
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        error: "config_error",
        message: "OpenAI API key is not configured",
      };
    }

    // Validate input
    if (!transcript || transcript.length === 0) {
      return {
        error: "invalid_input",
        message: "Transcript is empty or invalid",
      };
    }

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });

    // Calculate total video duration
    const totalDuration = transcript[transcript.length - 1].offset +
                         transcript[transcript.length - 1].duration;

    // Format transcript for LLM
    const transcriptText = formatTranscriptForLLM(transcript);

    // System prompt for the LLM
    const systemPrompt = `You are an expert content editor specializing in Arabic educational content.
Your task is to analyze video transcripts and identify the best segments for creating 3-minute educational shorts in Arabic.

IMPORTANT RULES:
1. Identify exactly 3 distinct segments that would work well as standalone educational shorts
2. Each segment should be approximately 2.5 to 3 minutes long (150-180 seconds)
3. Segments must NOT overlap
4. Each segment should cover a complete, self-contained topic or concept
5. Return ONLY valid JSON, no additional text or explanation
6. All Arabic content must be in Modern Standard Arabic (MSA)

OUTPUT FORMAT (JSON only):
{
  "segments": [
    {
      "segment_id": 1,
      "start": <start_time_in_seconds>,
      "end": <end_time_in_seconds>,
      "arabic_title": "<descriptive Arabic title>",
      "arabic_summary": "<2-3 sentence Arabic summary of the segment>",
      "key_points_translated": ["<key point 1 in Arabic>", "<key point 2 in Arabic>", "<key point 3 in Arabic>"]
    }
  ]
}`;

    // User prompt with context
    const userPrompt = `Analyze this transcript and identify 3 segments for Arabic educational shorts.

VIDEO INFORMATION:
- Total Duration: ${formatTime(totalDuration)} (${Math.round(totalDuration)} seconds)
- Video ID: ${videoId}

TRANSCRIPT:
${transcriptText}

REQUIREMENTS:
- Create exactly 3 segments
- Each segment should be 150-180 seconds (2.5-3 minutes)
- Segments must be sequential and non-overlapping
- Each segment should be educational and self-contained
- Return only valid JSON`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
    });

    // Extract and parse response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        error: "empty_response",
        message: "Received empty response from AI service",
      };
    }

    // Validate response structure
    const parsedResult = JSON.parse(content);
    const validationResult = ClipPlanResponseSchema.safeParse(parsedResult);

    if (!validationResult.success) {
      console.error("LLM response validation failed:", validationResult.error);
      return {
        error: "invalid_response",
        message: "AI service returned invalid data format",
      };
    }

    // Validate segments don't exceed video duration
    const validatedSegments = validationResult.data.segments.filter((segment) => {
      return segment.start < totalDuration && segment.end <= totalDuration;
    });

    if (validatedSegments.length === 0) {
      return {
        error: "no_valid_segments",
        message: "Could not generate valid segments within video duration",
      };
    }

    return {
      video_id: videoId,
      segments: validatedSegments as ClipSegment[],
    };

  } catch (error) {
    // Handle OpenAI API errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("api_key") || errorMessage.includes("authentication")) {
        return {
          error: "auth_error",
          message: "Invalid OpenAI API key",
        };
      }

      if (errorMessage.includes("rate limit")) {
        return {
          error: "rate_limit",
          message: "API rate limit exceeded, please try again later",
        };
      }

      if (errorMessage.includes("quota")) {
        return {
          error: "quota_exceeded",
          message: "OpenAI API quota exceeded",
        };
      }

      return {
        error: "processing_error",
        message: `Failed to generate clip plan: ${error.message}`,
      };
    }

    return {
      error: "unknown_error",
      message: "An unknown error occurred while generating the clip plan",
    };
  }
}
