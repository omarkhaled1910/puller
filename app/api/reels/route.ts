import { NextRequest, NextResponse } from "next/server";
import { generateReels } from "@/app/actions/generateReels";
import type { ReelConfig } from "@/app/lib/types";

/**
 * POST /api/reels
 * API route for generating reels from transcript using the 3-layer architecture
 *
 * Request body:
 * {
 *   "transcript": TranscriptSegment[],
 *   "videoId": string,
 *   "config?: {
 *     "reelCount": number,
 *     "minDuration": number,
 *     "maxDuration": number,
 *     "language": string
 *   }
 * }
 *
 * Response:
 * {
 *   "video_id": string,
 *   "config": ReelConfig,
 *   "reels": ReelSegment[]
 * }
 *
 * Or error:
 * {
 *   "error": string,
 *   "message": string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, videoId, config } = body;

    // Validate transcript
    if (!transcript || !Array.isArray(transcript)) {
      return NextResponse.json(
        { error: "validation_error", message: "Valid transcript array is required" },
        { status: 400 }
      );
    }

    if (transcript.length === 0) {
      return NextResponse.json(
        { error: "validation_error", message: "Transcript cannot be empty" },
        { status: 400 }
      );
    }

    // Validate video ID
    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json(
        { error: "validation_error", message: "Valid video ID is required" },
        { status: 400 }
      );
    }

    // Validate config if provided
    if (config) {
      if (typeof config !== "object" || Array.isArray(config)) {
        return NextResponse.json(
          { error: "validation_error", message: "Config must be an object" },
          { status: 400 }
        );
      }

      // Validate reelCount
      if (config.reelCount !== undefined) {
        if (typeof config.reelCount !== "number" || config.reelCount < 1) {
          return NextResponse.json(
            { error: "validation_error", message: "reelCount must be a positive number" },
            { status: 400 }
          );
        }
      }

      // Validate min/max duration
      if (config.minDuration !== undefined) {
        if (typeof config.minDuration !== "number" || config.minDuration < 1) {
          return NextResponse.json(
            { error: "validation_error", message: "minDuration must be a positive number" },
            { status: 400 }
          );
        }
      }

      if (config.maxDuration !== undefined) {
        if (typeof config.maxDuration !== "number" || config.maxDuration < 1) {
          return NextResponse.json(
            { error: "validation_error", message: "maxDuration must be a positive number" },
            { status: 400 }
          );
        }
      }

      // Check logical consistency
      const min = config.minDuration ?? 30;
      const max = config.maxDuration ?? 60;
      if (min >= max) {
        return NextResponse.json(
          { error: "validation_error", message: "minDuration must be less than maxDuration" },
          { status: 400 }
        );
      }
    }

    // Generate reels
    const result = await generateReels(transcript, videoId, config as ReelConfig);

    // Handle errors
    if ("error" in result) {
      const statusCode = getStatusCodeForError(result.error);
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("Reels API error:", error);
    return NextResponse.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Map error codes to HTTP status codes
 */
function getStatusCodeForError(errorCode: string): number {
  const statusMap: Record<string, number> = {
    validation_error: 400,
    invalid_input: 400,
    config_error: 500,
    auth_error: 500,
    rate_limit: 429,
    timeout: 504,
    network_error: 503,
    server_error: 500,
    processing_error: 500,
    unknown_error: 500,
    parse_error: 500,
    invalid_response: 500,
  };

  return statusMap[errorCode] ?? 500;
}

/**
 * GET /api/reels
 * Returns information about the reels endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/reels",
    method: "POST",
    description: "Generate social media reels from video transcript using Claude AI",
    requestBody: {
      transcript: "Array of transcript segments with text, duration, and offset",
      videoId: "YouTube video ID",
      config: {
        reelCount: "Number of reels to generate (default: 5)",
        minDuration: "Minimum duration in seconds (default: 30)",
        maxDuration: "Maximum duration in seconds (default: 60)",
        language: "Language code (default: 'en')",
      },
    },
    response: {
      video_id: "Video ID",
      config: "Configuration used",
      reels: "Array of generated reel segments with timestamps and metadata",
    },
  });
}
