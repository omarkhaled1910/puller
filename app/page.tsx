"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { VideoInputForm } from "@/app/components/VideoInputForm";
import { ClipCard } from "@/app/components/ClipCard";
import { Tabs, type TabType } from "@/app/components/TabbedView";
import { AudioTranscriptResult } from "@/app/components/AudioTranscriptResult";
import type {
  ClipPlan,
  ClipSegment,
  AudioTranscriptResult as AudioTranscriptResultType,
} from "@/app/lib/types";

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Server action wrappers for React Query
 */
async function fetchClipPlan(url: string): Promise<ClipPlan> {
  const transcriptResponse = await fetch("/api/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!transcriptResponse.ok) {
    const error = await transcriptResponse.json();
    throw new Error(error.message || "Failed to fetch transcript");
  }

  const { transcript } = await transcriptResponse.json();

  const clipPlanResponse = await fetch("/api/clip-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, videoId: extractVideoId(url) }),
  });

  if (!clipPlanResponse.ok) {
    const error = await clipPlanResponse.json();
    throw new Error(error.message || "Failed to generate clip plan");
  }

  return clipPlanResponse.json();
}

async function fetchAudioTranscript(
  url: string
): Promise<AudioTranscriptResultType> {
  const response = await fetch("/api/audio-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch audio and transcript");
  }

  return response.json();
}

/**
 * Main page component
 */
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("clips");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [approvedSegments, setApprovedSegments] = useState<Set<number>>(
    new Set()
  );
  const [rejectedSegments, setRejectedSegments] = useState<Set<number>>(
    new Set()
  );

  // React Query for fetching clip plan
  const {
    data: clipPlan,
    isLoading: isLoadingClips,
    error: clipsError,
    isError: isClipsError,
    isSuccess: isClipsSuccess,
  } = useQuery({
    queryKey: ["clipPlan", videoUrl],
    queryFn: () => fetchClipPlan(videoUrl!),
    enabled: !!videoUrl && activeTab === "clips",
    retry: false,
  });

  // React Query for fetching audio and transcript
  const {
    data: audioTranscript,
    isLoading: isLoadingAudio,
    error: audioError,
    isError: isAudioError,
  } = useQuery({
    queryKey: ["audioTranscript", videoUrl],
    queryFn: () => fetchAudioTranscript(videoUrl!),
    enabled: !!videoUrl && activeTab === "audio",
    retry: false,
  });

  const handleUrlSubmit = (url: string) => {
    setVideoUrl(url);
    setApprovedSegments(new Set());
    setRejectedSegments(new Set());
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const handleApprove = (segmentId: number) => {
    setApprovedSegments((prev) => new Set(prev).add(segmentId));
    setRejectedSegments((prev) => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  const handleReject = (segmentId: number) => {
    setRejectedSegments((prev) => new Set(prev).add(segmentId));
    setApprovedSegments((prev) => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    return "حدث خطأ غير متوقع";
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            مولد مقاطع فيديو تعليمية
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            حلل مقاطع فيديو يوتيوب وولد خطط لمقاطع تعليمية باللغة العربية
          </p>
        </header>

        {/* Input Form */}
        <div className="mb-6">
          <VideoInputForm
            onSubmit={handleUrlSubmit}
            isLoading={isLoadingClips || isLoadingAudio}
          />
        </div>

        {/* Tabs */}
        {videoUrl && (
          <Tabs activeTab={activeTab} onTabChange={handleTabChange} />
        )}

        {/* Clips Tab Content */}
        {activeTab === "clips" && (
          <>
            {/* Error State */}
            {isClipsError && (
              <div className="max-w-2xl mx-auto mb-8">
                <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-red-800 dark:text-red-400">
                        حدث خطأ
                      </h3>
                      <p className="text-red-700 dark:text-red-300">
                        {getErrorMessage(clipsError)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoadingClips && (
              <div className="max-w-2xl mx-auto text-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                  <div className="flex flex-col items-center gap-4">
                    <svg
                      className="animate-spin h-12 w-12 text-blue-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-400">
                      جاري تحليل الفيديو وتوليد خطة المقاطع...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Results - Clip Cards */}
            {isClipsSuccess && clipPlan && (
              <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    تم إنشاء خطة المقاطع بنجاح
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    تم تحديد {clipPlan.segments.length} مقاطع تعليمية
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1">
                  {clipPlan.segments.map((segment: ClipSegment) => (
                    <ClipCard
                      key={segment.segment_id}
                      segment={segment}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  ))}
                </div>

                {approvedSegments.size > 0 && (
                  <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-800 dark:text-green-400 text-center">
                      تمت الموافقة على {approvedSegments.size} من أصل{" "}
                      {clipPlan.segments.length} مقاطع
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Initial State for Clips Tab */}
            {!videoUrl && !isLoadingClips && !isClipsError && !isClipsSuccess && (
              <div className="max-w-2xl mx-auto text-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                  <svg
                    className="w-16 h-16 text-blue-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    كيفية الاستخدام
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    الصق رابط فيديو يوتيوب في الحقل أعلاه لتحليله وتوليد مقاطع
                    تعليمية
                  </p>
                  <ul className="text-right text-gray-600 dark:text-gray-400 space-y-2 inline-block">
                    <li>1. أدخل رابط فيديو يوتيوب يحتوي على ترجمة</li>
                    <li>2. انتظر تحليل الفيديو واستخراج النص</li>
                    <li>3. راجع المقاطع المقترحة باللغة العربية</li>
                    <li>4. وافق على المقاطع التي تريد استخدامها</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        {/* Audio & Text Tab Content */}
        {activeTab === "audio" && (
          <AudioTranscriptResult
            data={audioTranscript || null}
            isLoading={isLoadingAudio}
            error={isAudioError ? getErrorMessage(audioError) : null}
          />
        )}
      </div>
    </main>
  );
}
