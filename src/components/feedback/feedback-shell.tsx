"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Radar } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { FeedbackProvider } from "./feedback-provider";

export function FeedbackShell({ children }: { children: ReactNode }) {
  const isGuide = usePathname() === "/guide";
  return (
    <FeedbackProvider>
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2.5 rounded-lg font-semibold tracking-tight focus-visible:outline-2"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-700 text-white">
              <Radar aria-hidden="true" className="size-5" />
            </span>
            Feedback Radar
          </Link>
          <nav aria-label="Main navigation" className="flex gap-1 text-sm">
            <Link
              href="/"
              aria-current={!isGuide ? "page" : undefined}
              className="flex min-h-11 items-center rounded-lg px-3 text-muted-foreground hover:bg-muted aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-800 focus-visible:outline-2"
            >
              Analyze feedback
            </Link>
            <Link
              href="/guide"
              aria-current={isGuide ? "page" : undefined}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-muted-foreground hover:bg-muted aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-800 focus-visible:outline-2"
            >
              <CircleHelp aria-hidden="true" className="size-4" />
              How it works
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mx-auto w-full max-w-7xl px-5 py-6 text-xs text-muted-foreground sm:px-8">
        <p className="border-t pt-5">
          Feedback Radar · A clearer signal for better service.
        </p>
      </footer>
      <Toaster />
    </FeedbackProvider>
  );
}
