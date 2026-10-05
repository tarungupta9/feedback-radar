import { analysisSchema, type Analysis } from "./rubric";
import { apiErrorSchema } from "./api-errors";
import type { Feedback } from "./schema";

export type FeedbackRow = { feedback: Feedback } & (
  | { status: "ready" | "analyzing" }
  | { status: "complete"; analysis: Analysis }
  | { status: "failed"; error: string }
);

export type BatchControl =
  | { status: "running" }
  | { status: "coolingDown"; message: string; resumeAt: string }
  | { status: "paused" | "blocked"; message: string; resumeAt?: string };
export type RunnerOutcome =
  | { status: "complete" }
  | Extract<BatchControl, { status: "paused" | "blocked" }>;

export function retryAfterSeconds(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds <= 31536000
      ? Math.max(1, seconds)
      : null;
  }
  if (!/GMT$/i.test(value.trim())) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) && date - now <= 31536000000
    ? Math.max(1, Math.ceil((date - now) / 1000))
    : null;
}

function waitUntil(
  at: number,
  signals: (AbortSignal | undefined)[],
): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      for (const signal of signals)
        signal?.removeEventListener("abort", finish);
      resolve();
    };
    if (signals.some((signal) => signal?.aborted)) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, Math.max(0, at - Date.now()));
    for (const signal of signals)
      signal?.addEventListener("abort", finish, { once: true });
  });
}

export async function analyzeRows(
  feedbacks: Feedback[],
  onUpdate: (row: FeedbackRow) => void,
  signal?: AbortSignal,
  options: {
    onControl?: (control: BatchControl) => void;
    pauseSignal?: AbortSignal;
  } = {},
): Promise<RunnerOutcome> {
  let next = 0;
  let settled = 0;
  let cooldownUntil = 0;
  const stopWaiting = new AbortController();
  let stop: Extract<BatchControl, { status: "paused" | "blocked" }> | undefined;
  const stopped = () =>
    !!stop || !!signal?.aborted || !!options.pauseSignal?.aborted;
  const setStop = (
    control: Extract<BatchControl, { status: "paused" | "blocked" }>,
  ) => {
    if (!stop || control.status === "blocked") {
      stop = control;
      stopWaiting.abort();
      options.onControl?.(control);
    }
  };
  async function gate() {
    while (!stopped() && Date.now() < cooldownUntil)
      await waitUntil(cooldownUntil, [
        signal,
        options.pauseSignal,
        stopWaiting.signal,
      ]);
    if (stopped()) return false;
    if (cooldownUntil) {
      cooldownUntil = 0;
      options.onControl?.({ status: "running" });
    }
    return true;
  }
  async function worker() {
    while (next < feedbacks.length && (await gate())) {
      // Recheck synchronously after awaiting: another worker may have stopped dispatch.
      if (stopped() || next >= feedbacks.length) return;
      const feedback = feedbacks[next++];
      let retries = 0;
      while (await gate()) {
        if (stopped()) return;
        onUpdate({ feedback, status: "analyzing" });
        try {
          const response = await fetch("/api/feedback/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(feedback),
            signal,
          });
          const body: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            const parsed = apiErrorSchema.safeParse(body);
            const api = parsed.success ? parsed.data : null;
            const temporary =
              api?.code === "RATE_LIMITED" || api?.code === "CAPACITY_LIMITED";
            const edge = response.status === 429 && !api;
            const blocked =
              api &&
              [
                "IP_QUOTA_EXHAUSTED",
                "GLOBAL_QUOTA_EXHAUSTED",
                "PROTECTION_UNAVAILABLE",
                "ANALYSIS_DISABLED",
              ].includes(api.code);
            if (temporary || edge || blocked) {
              onUpdate({ feedback, status: "ready" });
              const message =
                api?.error ??
                "Too many requests. Your remaining feedback is waiting.";
              const seconds = Math.max(
                retryAfterSeconds(response.headers.get("retry-after")) ??
                  (edge ? 60 : 1),
                api?.resumeAt
                  ? Math.max(
                      1,
                      Math.ceil((Date.parse(api.resumeAt) - Date.now()) / 1000),
                    )
                  : 1,
              );
              const resumeAt =
                api?.resumeAt ??
                new Date(Date.now() + seconds * 1000).toISOString();
              if (blocked) {
                setStop({
                  status: "blocked",
                  message,
                  resumeAt: api?.resumeAt,
                });
                return;
              }
              if (retries >= 3 || seconds > 60) {
                setStop({ status: "paused", message, resumeAt });
                return;
              }
              retries++;
              if (stopped()) return;
              const until =
                Date.now() + seconds * 1000 + Math.floor(Math.random() * 200);
              if (until > cooldownUntil) {
                cooldownUntil = until;
                options.onControl?.({
                  status: "coolingDown",
                  message,
                  resumeAt: new Date(until).toISOString(),
                });
              }
              continue;
            }
            const error =
              body &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : "Analysis failed. Retry this row.";
            throw new Error(error);
          }
          const analysis = analysisSchema.parse(body);
          if (analysis.feedback_id !== feedback.feedback_id)
            throw new Error(
              "AI returned a mismatched feedback ID. Retry this row.",
            );
          if (!signal?.aborted)
            onUpdate({ feedback, status: "complete", analysis });
        } catch (error) {
          if (!signal?.aborted)
            onUpdate({
              feedback,
              status: "failed",
              error:
                error instanceof Error && error.name !== "ZodError"
                  ? error.message
                  : "AI returned an invalid result. Retry this row.",
            });
        }
        settled++;
        break;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, feedbacks.length) }, worker),
  );
  if (settled === feedbacks.length) return { status: "complete" };
  if (stop) return stop;
  if (options.pauseSignal?.aborted || signal?.aborted)
    return {
      status: "paused",
      message: "Analysis paused. Resume to process remaining feedback.",
    };
  return { status: "complete" };
}
