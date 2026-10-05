"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  FileUp,
  ArrowRight,
  LoaderCircle,
  FileCheck2,
  CircleHelp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useFeedback } from "./feedback-provider";
import { FeedbackPreview } from "./feedback-preview";

export function UploadCard() {
  const { session, uploadFile, loadSample, submit } = useFeedback();
  const fileInput = useRef<HTMLInputElement>(null);
  const validating = session.stage === "validating";
  const ready = session.stage === "ready";
  const count = session.rows.length;
  return (
    <Card>
      <CardContent className="space-y-5">
        <Input
          ref={fileInput}
          id="feedback-file"
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept=".csv,.xlsx"
          disabled={validating}
          aria-label="Choose a feedback file"
          aria-describedby={
            session.issues.length ? "file-help upload-errors" : "file-help"
          }
          aria-invalid={session.issues.length > 0}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void uploadFile(file);
          }}
        />
        <div
          className={
            ready
              ? "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-emerald-50 p-4"
              : "space-y-4 rounded-xl border border-dashed bg-muted/30 p-6 sm:p-8"
          }
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!validating && event.dataTransfer.files[0])
              void uploadFile(event.dataTransfer.files[0]);
          }}
        >
          {ready ? (
            <div className="flex min-w-0 items-start gap-3 text-emerald-900">
              <FileCheck2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <p className="break-all font-medium">{session.fileName}</p>
                <p className="text-sm">
                  {count} valid feedback {count === 1 ? "row" : "rows"} · Ready
                  to analyze
                </p>
              </div>
            </div>
          ) : (
            <>
              <FileUp aria-hidden="true" className="size-8 text-indigo-700" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">
                  Choose a feedback file
                </h2>
                <p className="text-sm text-muted-foreground">
                  Drop your file here or browse. Preview it before analysis.
                </p>
              </div>
            </>
          )}
          <Button
            variant={ready ? "outline" : "default"}
            className={
              ready
                ? "min-h-11"
                : "min-h-11 bg-indigo-700 text-white hover:bg-indigo-800"
            }
            disabled={validating}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp aria-hidden="true" />
            {ready ? "Replace file" : "Choose a feedback file"}
          </Button>
          <p
            id="file-help"
            className={ready ? "sr-only" : "text-xs text-muted-foreground"}
          >
            CSV or Excel (.xlsx) · Up to 2 MB and 100 rows
          </p>
        </div>
        {validating && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Checking {session.fileName}…
          </p>
        )}
        {session.issues.length > 0 && (
          <div
            id="upload-errors"
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <p className="font-medium text-destructive">Invalid file format</p>
            <ul className="list-inside list-disc space-y-1">
              {session.issues.slice(0, 8).map((issue, index) => (
                <li key={index}>
                  {issue.row ? "Row " + issue.row : "File"}
                  {issue.column ? " · " + issue.column : ""}: {issue.message}
                </li>
              ))}
            </ul>
            {session.issues.length > 8 && (
              <p>
                And {session.issues.length - 8} more issues. Fix the file and
                upload again.
              </p>
            )}
            <Link
              href="/guide#sample"
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              Compare with the sample format
            </Link>
          </div>
        )}
        {ready && (
          <FeedbackPreview
            key={session.fileName}
            feedbacks={session.rows.map((row) => row.feedback)}
          />
        )}
        <div className="space-y-3 border-t pt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="min-h-11 bg-indigo-700 text-white hover:bg-indigo-800 sm:flex-1"
              disabled={!ready || validating}
              onClick={() => void submit()}
            >
              {ready
                ? "Analyze " +
                  count +
                  " feedback " +
                  (count === 1 ? "row" : "rows")
                : "Analyze feedback"}
              <ArrowRight aria-hidden="true" />
            </Button>
            {!ready && (
              <Button
                variant="outline"
                className="min-h-11"
                disabled={validating}
                onClick={() => void loadSample()}
              >
                Try the sample data
              </Button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Analysis sends feedback, service and rating to TypeSafe AI. Files
            are parsed in your browser. Results stay in this tab and clear on
            refresh.
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <CircleHelp aria-hidden="true" className="size-4" />
          New here?
          <Link
            href="/guide"
            className="inline-flex min-h-11 items-center font-medium text-indigo-700 underline underline-offset-4"
          >
            See how it works
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
