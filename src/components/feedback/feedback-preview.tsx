"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Feedback } from "@/lib/feedback/schema";

export function FeedbackPreview({ feedbacks }: { feedbacks: Feedback[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? feedbacks : feedbacks.slice(0, 5);
  const hasDate = feedbacks.some((row) => row.date);
  const hasService = feedbacks.some((row) => row.service);
  const hasRating = feedbacks.some((row) => row.rating);
  return (
    <section aria-labelledby="preview-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="preview-heading"
          tabIndex={-1}
          className="font-semibold focus-visible:outline-2"
        >
          Your feedback preview
        </h2>
        <p id="preview-count" className="text-xs text-muted-foreground">
          Showing {visible.length} of {feedbacks.length} rows
        </p>
      </div>
      <div
        className="max-h-80 overflow-auto rounded-lg border focus-visible:outline-2"
        tabIndex={0}
        role="region"
        aria-label="Scrollable file preview"
      >
        <Table aria-describedby="preview-count" id="preview-table">
          <TableCaption className="sr-only">
            Uploaded file contents
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">ID</TableHead>
              <TableHead scope="col">Feedback</TableHead>
              {hasDate && <TableHead scope="col">Date</TableHead>}
              {hasService && <TableHead scope="col">Service</TableHead>}
              {hasRating && <TableHead scope="col">Rating</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.feedback_id}>
                <TableCell className="max-w-40 break-all align-top font-mono text-xs">
                  {row.feedback_id}
                </TableCell>
                <TableCell className="min-w-56 max-w-lg whitespace-pre-wrap break-words align-top leading-relaxed [overflow-wrap:anywhere]">
                  {row.feedback}
                </TableCell>
                {hasDate && (
                  <TableCell className="align-top">{row.date || "—"}</TableCell>
                )}
                {hasService && (
                  <TableCell className="max-w-40 break-words align-top [overflow-wrap:anywhere]">
                    {row.service || "—"}
                  </TableCell>
                )}
                {hasRating && (
                  <TableCell className="align-top">
                    {row.rating ? row.rating + "/5" : "—"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {feedbacks.length > 5 && (
        <Button
          variant="outline"
          className="min-h-11"
          aria-expanded={showAll}
          aria-controls="preview-table"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? "Show first 5 rows"
            : "View all " + feedbacks.length + " rows"}
        </Button>
      )}
    </section>
  );
}
