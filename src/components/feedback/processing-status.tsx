import { LoaderCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { FeedbackRow } from "@/lib/feedback/client";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-provider";

export function ProcessingStatus({
  rows,
  fileName,
  retrying,
}: {
  rows: FeedbackRow[];
  fileName: string;
  retrying: boolean;
}) {
  const { session, pause } = useFeedback();
  const cooling =
    session.control.status === "coolingDown" ? session.control : null;
  const succeeded = rows.filter((row) => row.status === "complete").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const settled = succeeded + failed;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 shrink-0 animate-spin text-indigo-700 motion-reduce:animate-none"
          />
          <div className="min-w-0">
            <h2 className="font-semibold">
              {retrying
                ? "Retrying failed feedback"
                : "Analyzing your feedback"}
            </h2>
            <p className="break-all text-sm text-muted-foreground">
              {fileName}
            </p>
          </div>
        </div>
        <progress
          aria-label="Feedback analysis progress"
          value={settled}
          max={rows.length}
          className="block h-2 w-full overflow-hidden rounded-full bg-indigo-50 accent-indigo-700 [&::-moz-progress-bar]:bg-indigo-700 [&::-webkit-progress-bar]:bg-indigo-50 [&::-webkit-progress-value]:bg-indigo-700"
        />
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm"
        >
          {cooling
            ? `Waiting before continuing. ${cooling.message}`
            : `Processing feedback: ${settled} of ${rows.length} finished.`}
        </p>
        {cooling && (
          <p className="text-sm text-muted-foreground">
            Continuing after {new Date(cooling.resumeAt).toLocaleTimeString()}.
          </p>
        )}
        <Button variant="outline" className="min-h-11" onClick={pause}>
          Pause analysis
        </Button>
        <p className="text-xs text-muted-foreground">
          Keep this tab open. You can visit How it works while analysis
          continues.
        </p>
      </CardContent>
    </Card>
  );
}
