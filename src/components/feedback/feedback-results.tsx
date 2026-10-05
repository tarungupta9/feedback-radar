"use client";

import Link from "next/link";
import { ArrowUpRight, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useFeedback } from "./feedback-provider";
import { FeedbackTable } from "./feedback-table";
import { InsightsSummary } from "./insights-summary";
import { ProcessingStatus } from "./processing-status";
import { BatchNotice } from "./batch-notice";

export function FeedbackResults() {
  const { session, submit, startNewUpload, canSubmit } = useFeedback();
  const busy = session.stage === "analyzing";
  const completed = session.rows.flatMap((row) =>
    row.status === "complete" ? [row.analysis] : [],
  );
  const failedCount = session.rows.filter(
    (row) => row.status === "failed",
  ).length;
  const waiting = session.rows.filter((row) => row.status === "ready").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div className="min-w-0 space-y-1">
          <p className="break-all font-medium">{session.fileName}</p>
          {!busy && (
            <p role="status" className="text-sm text-muted-foreground">
              {session.stage === "complete"
                ? `Analysis finished: ${completed.length} succeeded, ${failedCount} failed.`
                : `Analysis incomplete: ${completed.length} succeeded, ${failedCount} failed, ${waiting} waiting.`}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={startNewUpload}
        >
          <FileUp aria-hidden="true" />
          Analyze another file
        </Button>
      </div>
      <BatchNotice
        control={session.control}
        canResume={canSubmit && !busy}
        resume={() => void submit()}
      />
      {busy && (
        <ProcessingStatus
          rows={session.rows}
          fileName={session.fileName}
          retrying
        />
      )}
      {failedCount > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <div className="space-y-1">
            <p className="font-medium">
              {completed.length
                ? failedCount +
                  " feedback " +
                  (failedCount === 1 ? "row needs" : "rows need") +
                  " another try."
                : "We couldn’t analyze your feedback."}
            </p>
            <p>
              {completed.length
                ? "Successful results are kept. Retry only the failed rows."
                : "Check the errors below, then retry. Your file is still available."}
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
          >
            Retry {failedCount} failed {failedCount === 1 ? "row" : "rows"}
          </Button>
        </div>
      )}
      <InsightsSummary results={completed} total={session.rows.length} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">Feedback & insights</h2>
          </CardTitle>
          <CardDescription>
            Original feedback alongside classifications and suggested actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable feedback results"
            className="overflow-auto rounded-lg focus-visible:outline-2"
          >
            <FeedbackTable
              rows={session.rows}
              busy={busy}
              retryDisabled={!canSubmit}
              retry={(id) => void submit(id)}
            />
          </div>
        </CardContent>
      </Card>
      <p className="flex flex-wrap items-center gap-x-2 text-xs leading-relaxed text-muted-foreground">
        Review AI suggestions before taking action. Results clear on refresh.
        <Link
          href="/guide#assessment"
          className="inline-flex min-h-11 items-center gap-1 text-indigo-700 underline underline-offset-4"
        >
          How we assess feedback
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      </p>
    </div>
  );
}
