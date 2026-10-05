import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FeedbackShell } from "@/components/feedback/feedback-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedback Radar",
  description:
    "Upload customer feedback, understand customer happiness, and decide what to improve.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <FeedbackShell>{children}</FeedbackShell>
      </body>
    </html>
  );
}
