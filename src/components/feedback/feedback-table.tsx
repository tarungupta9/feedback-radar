import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  happiness,
  topics,
  impacts,
  urgencies,
  actions,
} from "@/lib/feedback/rubric";
import type { FeedbackRow } from "@/lib/feedback/client";

const sentimentStyles = {
  happy: "bg-emerald-50 text-emerald-800",
  unhappy: "bg-rose-50 text-rose-800",
  mixed: "bg-amber-50 text-amber-800",
  neutral: "bg-slate-100 text-slate-700",
  unclear: "bg-slate-100 text-slate-700",
};

export function FeedbackTable({
  rows,
  busy,
  retry,
  retryDisabled = false,
}: {
  rows: FeedbackRow[];
  busy: boolean;
  retry: (id: string) => void;
  retryDisabled?: boolean;
}) {
  return (
    <Table>
      <TableCaption>
        Original feedback and AI suggestions. Review classifications before
        taking action.
      </TableCaption>
      <TableHeader>
        <TableRow>
          {[
            "Feedback",
            "Happiness",
            "Topic",
            "Impact / urgency",
            "Suggested next step",
          ].map((header) => (
            <TableHead scope="col" key={header}>
              {header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.feedback.feedback_id}>
            <TableCell className="min-w-64 max-w-md align-top">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{row.feedback.feedback_id}</span>
                {row.feedback.service && <span>{row.feedback.service}</span>}
                {row.feedback.date && <span>{row.feedback.date}</span>}
                {row.feedback.rating && (
                  <span>Rating {row.feedback.rating}/5</span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                {row.feedback.feedback}
              </p>
            </TableCell>
            {row.status === "complete" ? (
              <>
                <TableCell className="align-top">
                  <Badge className={sentimentStyles[row.analysis.happiness]}>
                    {happiness[row.analysis.happiness]}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">
                  {topics[row.analysis.topic]}
                </TableCell>
                <TableCell className="align-top">
                  <div className="space-y-2">
                    <Badge
                      className={
                        row.analysis.impact === "critical"
                          ? "bg-rose-50 text-rose-800"
                          : ""
                      }
                    >
                      {impacts[row.analysis.impact]}
                    </Badge>
                    <p className="text-xs">{urgencies[row.analysis.urgency]}</p>
                  </div>
                </TableCell>
                <TableCell className="min-w-60 max-w-sm align-top">
                  <p className="leading-relaxed">
                    {actions[row.analysis.action]}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confidence {Math.round(row.analysis.confidence * 100)}%
                    {row.analysis.needsReview ? " · Needs human review" : ""}
                  </p>
                </TableCell>
              </>
            ) : (
              <TableCell colSpan={4} className="align-top">
                <div className="space-y-2">
                  <p
                    className={
                      row.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {row.status === "failed"
                      ? row.error
                      : row.status === "analyzing"
                        ? "Analyzing feedback…"
                        : "Waiting to analyze"}
                  </p>
                  {row.status === "failed" && (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={busy || retryDisabled}
                      onClick={() => retry(row.feedback.feedback_id)}
                    >
                      Retry {row.feedback.feedback_id}
                    </Button>
                  )}
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
