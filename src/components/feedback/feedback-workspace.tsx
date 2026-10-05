"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UploadCard } from "./upload-card";
import { useFeedback } from "./feedback-provider";
import { ProcessingStatus } from "./processing-status";
import { FeedbackResults } from "./feedback-results";

export function FeedbackWorkspace() {
  const { session, hasPreviousResults, restoreResults } = useFeedback();
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = session.stage === "analyzing";
  const results =
    ["complete", "paused", "blocked"].includes(session.stage) ||
    (busy && session.retrying);

  useEffect(() => {
    if (session.stage === "ready")
      document.getElementById("preview-heading")?.focus();
    else if (
      ["complete", "analyzing", "paused", "blocked"].includes(session.stage)
    )
      heading.current?.focus();
  }, [session.stage]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={
        "mx-auto w-full space-y-6 px-5 py-8 sm:px-8 sm:py-10 " +
        (results ? "max-w-7xl" : "max-w-4xl")
      }
    >
      <div className="space-y-2">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight focus-visible:outline-2 sm:text-4xl"
        >
          {results
            ? "Your feedback insights"
            : busy
              ? "Finding the signal in your feedback"
              : "Analyze customer feedback"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {results
            ? "Understand what needs attention and decide what to improve."
            : busy
              ? "We’re assessing each response. Your results will appear here."
              : "Upload your file, review its contents, then analyze when you’re ready."}
        </p>
      </div>
      {results ? (
        <FeedbackResults />
      ) : busy ? (
        <ProcessingStatus
          rows={session.rows}
          fileName={session.fileName}
          retrying={false}
        />
      ) : (
        <>
          <UploadCard />
          {hasPreviousResults && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={session.stage === "validating"}
              onClick={restoreResults}
            >
              Back to previous results
            </Button>
          )}
        </>
      )}
    </main>
  );
}
