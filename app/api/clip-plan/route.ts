import { NextRequest, NextResponse } from "next/server";
import { generateClipPlan } from "@/app/actions/generateClipPlan";

/**
 * POST /api/clip-plan
 * API route for generating clip plan from transcript
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, videoId } = body;

    if (!transcript || !Array.isArray(transcript)) {
      return NextResponse.json(
        { error: "validation_error", message: "Valid transcript is required" },
        { status: 400 }
      );
    }

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json(
        { error: "validation_error", message: "Video ID is required" },
        { status: 400 }
      );
    }

    const result = await generateClipPlan(transcript, videoId);

    if ("error" in result) {
      const statusCode =
        result.error === "config_error" ||
        result.error === "auth_error" ||
        result.error === "quota_exceeded"
          ? 500
          : 400;
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Clip plan API error:", error);
    return NextResponse.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
