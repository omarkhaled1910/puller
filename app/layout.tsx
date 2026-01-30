import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/app/components/QueryProvider";

export const metadata: Metadata = {
  title: "YouTube Clipper - Arabic Shorts Generator",
  description: "Analyze YouTube videos and generate clip plans for Arabic educational shorts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
