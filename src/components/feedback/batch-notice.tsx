import { Button } from "@/components/ui/button";
import type { BatchControl } from "@/lib/feedback/client";

export function BatchNotice({
  control,
  canResume,
  resume,
}: {
  control: BatchControl;
  canResume: boolean;
  resume: () => void;
}) {
  if (control.status === "running" || control.status === "coolingDown")
    return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm"
    >
      <p className="font-medium">
        Analysis {control.status === "blocked" ? "on hold" : "paused"}
      </p>
      <p>
        {control.message} Completed results are kept; remaining rows are
        waiting.
      </p>
      {control.resumeAt && (
        <p>
          Available again: {new Date(control.resumeAt).toLocaleString()} (your
          local time).
        </p>
      )}
      <Button
        variant="outline"
        className="min-h-11"
        disabled={!canResume}
        onClick={resume}
      >
        Resume remaining feedback
      </Button>
    </div>
  );
}
