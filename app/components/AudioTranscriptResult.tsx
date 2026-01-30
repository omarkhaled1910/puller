"use client";

import { useState } from "react";
import type { AudioTranscriptResult, TranscriptWithTimestamps } from "@/app/lib/types";

interface AudioTranscriptResultProps {
  data: AudioTranscriptResult | null;
  isLoading: boolean;
  error: string | null;
}

export function AudioTranscriptResult({
  data,
  isLoading,
  error,
}: AudioTranscriptResultProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center">
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
              جاري تحميل الصوت والنص...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
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
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <svg
            className="w-16 h-16 text-purple-600 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            تحميل الصوت والنص
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            أدخل رابط الفيديو أعلاه لتحميل الصوت واستخراج النص مع الطوابع الزمنية
          </p>
        </div>
      </div>
    );
  }

  const { audio, transcript } = data;

  // Filter segments based on search and time range
  const filteredSegments = transcript.segments.filter((segment) => {
    const matchesSearch =
      !searchQuery ||
      segment.text.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTimeRange =
      !filterStart ||
      !filterEnd ||
      (segment.start >= parseFloat(filterStart) &&
        segment.end <= parseFloat(filterEnd));

    return matchesSearch && matchesTimeRange;
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Summary Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg shadow-md p-6 mb-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">
              تم التحميل بنجاح
            </h2>
            <p className="text-purple-100 mb-1">
              <span className="font-semibold">العنوان:</span> {transcript.videoTitle}
            </p>
            <p className="text-purple-100 text-sm">
              <span className="font-semibold">معرف الفيديو:</span> {transcript.videoId}
            </p>
            {audio.duration && (
              <p className="text-purple-100 text-sm">
                <span className="font-semibold">المدة:</span> {Math.floor(audio.duration / 60)}:{(audio.duration % 60).toString().padStart(2, "0")}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
              <div className="text-2xl font-bold">{transcript.segments.length}</div>
              <div className="text-xs text-purple-100">مقطع</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
              <div className="text-2xl font-bold">{Math.floor(transcript.segments.reduce((acc, s) => acc + (s.end - s.start), 0) / 60)}</div>
              <div className="text-xs text-purple-100">دقائق</div>
            </div>
          </div>
        </div>
      </div>

      {/* File Info Cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Audio File Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 border-2 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                ملف الصوت
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                M4AFormat
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded truncate">
            {audio.filename}
          </p>
        </div>

        {/* Transcript File Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                ملف النص
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                مع الطوابع الزمنية
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded truncate">
            {transcript.videoId}.txt
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              البحث في النص
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن كلمة في النص..."
              className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="w-full md:w-32">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              من (ثانية)
            </label>
            <input
              type="number"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="w-full md:w-32">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              إلى (ثانية)
            </label>
            <input
              type="number"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              placeholder="END"
              min="0"
              className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        {(searchQuery || filterStart || filterEnd) && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            عرض {filteredSegments.length} من {transcript.segments.length} مقاطع
          </div>
        )}
      </div>

      {/* Transcript Segments */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            النص مع الطوابع الزمنية
          </h3>
          <button
            onClick={() => {
              const content = filteredSegments
                .map((s) => `[${s.startTime} - ${s.endTime}] ${s.text}`)
                .join("\n");
              navigator.clipboard.writeText(content);
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            نسخ النص المفلتر
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                  الوقت
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                  النص
                </th>
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 w-20">
                  إجراء
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSegments.map((segment, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-3 py-1 rounded-full text-sm font-mono font-medium">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {segment.startTime} - {segment.endTime}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {searchQuery ? (
                      <>
                        {segment.text.split(
                          new RegExp(`(${searchQuery})`, "gi")
                        ).map((part, i) =>
                          part.toLowerCase() === searchQuery.toLowerCase() ? (
                            <mark
                              key={i}
                              className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5"
                            >
                              {part}
                            </mark>
                          ) : (
                            part
                          )
                        )}
                      </>
                    ) : (
                      segment.text
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => navigator.clipboard.writeText(segment.text)}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="نسخ"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Text Section */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          النص الكامل
        </h3>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {searchQuery ? (
              <>
                {transcript.fullText.split(
                  new RegExp(`(${searchQuery})`, "gi")
                ).map((part, i) =>
                  part.toLowerCase() === searchQuery.toLowerCase() ? (
                    <mark
                      key={i}
                      className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5"
                    >
                      {part}
                    </mark>
                  ) : (
                    part
                  )
                )}
              </>
            ) : (
              transcript.fullText
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
