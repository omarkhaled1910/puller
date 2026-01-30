import { NextRequest, NextResponse } from "next/server";
import { fetchTranscript } from "@/app/actions/fetchTranscript";

/**
 * POST /api/transcript
 * API route for fetching YouTube video transcript
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "validation_error", message: "URL is required" },
        { status: 400 }
      );
    }

    const result = await fetchTranscript(url);

    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({ transcript: result });
  } catch (error) {
    console.error("Transcript API error:", error);
    return NextResponse.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
