"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

/**
 * Props for the VideoInputForm component
 */
interface VideoInputFormProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

/**
 * Form component for submitting YouTube video URLs
 * Uses React Query mutation for managing async state
 */
export function VideoInputForm({ onSubmit, isLoading = false }: VideoInputFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  // Mutation wrapper for form submission
  const mutation = useMutation({
    mutationFn: (videoUrl: string) => {
      setError("");
      onSubmit(videoUrl);
      return Promise.resolve();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!url.trim()) {
      setError("الرجاء إدخال رابط فيديو يوتيوب");
      return;
    }

    // Validate YouTube URL format
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
    ];

    const isValid = patterns.some((pattern) => pattern.test(url));
    if (!isValid) {
      setError("الرجاء إدخال رابط يوتيوب صحيح");
      return;
    }

    mutation.mutate(url);
  };

  const isMutating = mutation.isPending || isLoading;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={isMutating}
            className={`w-full px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
              ${error
                ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                : "border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
              }
              focus:outline-none focus:ring-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            dir="ltr"
          />
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isMutating}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
            text-white font-medium rounded-lg transition-colors
            disabled:cursor-not-allowed disabled:opacity-70
            flex items-center justify-center gap-2 min-w-[120px]"
        >
          {isMutating ? (
            <>
              <svg
                className="animate-spin h-5 w-5"
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
              <span>جاري التحليل...</span>
            </>
          ) : (
            <span>تحليل الفيديو</span>
          )}
        </button>
      </div>
    </form>
  );
}
