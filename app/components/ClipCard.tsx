"use client";

import type { ClipSegment } from "@/app/lib/types";
import { useState } from "react";

/**
 * Props for the ClipCard component
 */
interface ClipCardProps {
  segment: ClipSegment;
  onApprove?: (segmentId: number) => void;
  onReject?: (segmentId: number) => void;
}

/**
 * Convert seconds to readable timestamp format (MM:SS)
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Calculate duration in minutes and seconds
 */
function formatDuration(start: number, end: number): string {
  const duration = Math.round(end - start);
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Card component displaying a clip segment with Arabic content
 * Shows title, summary, key points, and timestamps
 */
export function ClipCard({ segment, onApprove, onReject }: ClipCardProps) {
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);

  const handleApprove = () => {
    setApproved(true);
    setRejected(false);
    onApprove?.(segment.segment_id);
  };

  const handleReject = () => {
    setRejected(true);
    setApproved(false);
    onReject?.(segment.segment_id);
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden
        transition-all duration-200 hover:shadow-lg
        border-2 ${
          approved
            ? "border-green-500"
            : rejected
            ? "border-red-500"
            : "border-gray-200 dark:border-gray-700"
        }`}
    >
      {/* Card Header */}
      <div className="bg-gradient-to-l from-blue-600 to-blue-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-lg">
            مقطع {segment.segment_id}
          </span>
          <span className="text-blue-100 text-sm font-medium">
            {formatDuration(segment.start, segment.end)}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-4">
        {/* Timestamp Range */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
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
          <span dir="ltr">
            {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
          </span>
        </div>

        {/* Arabic Title */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {segment.arabic_title}
          </h3>
        </div>

        {/* Arabic Summary */}
        <div>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {segment.arabic_summary}
          </p>
        </div>

        {/* Key Points */}
        {segment.key_points_translated.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
              النقاط الرئيسية:
            </h4>
            <ul className="space-y-1">
              {segment.key_points_translated.map((point, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleApprove}
            disabled={approved}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all
              ${
                approved
                  ? "bg-green-500 text-white cursor-default"
                  : "bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400"
              }`}
          >
            {approved ? "✓ تمت الموافقة" : "موافقة"}
          </button>
          <button
            onClick={handleReject}
            disabled={rejected}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all
              ${
                rejected
                  ? "bg-red-500 text-white cursor-default"
                  : "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
              }`}
          >
            {rejected ? "✕ تم الرفض" : "رفض"}
          </button>
        </div>
      </div>
    </div>
  );
}
