import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRows, type FeedbackRow } from "@/lib/feedback/client";

import { analysis } from "./fixtures/analysis";
afterEach(() => vi.unstubAllGlobals());
describe("analysis runner", () => {
  it("runs no more than three requests and retains IDs with out-of-order responses", async () => {
    let active = 0;
    let max = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) => {
        active++;
        max = Math.max(max, active);
        const id = JSON.parse(String(init.body)).feedback_id;
        await new Promise((resolve) =>
          setTimeout(resolve, id === "A1" ? 20 : 1),
        );
        active--;
        return Response.json({ ...analysis, feedback_id: id });
      }),
    );
    const updates: FeedbackRow[] = [];
    await analyzeRows(
      Array.from({ length: 7 }, (_, i) => ({
        feedback_id: `A${i + 1}`,
        feedback: "Great",
      })),
      (row) => updates.push(row),
    );
    expect(max).toBe(3);
    expect(updates.filter((row) => row.status === "complete")).toHaveLength(7);
  });
  it("preserves failed rows and rejects malformed or mismatched responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              error: "AI busy",
              code: "PROVIDER_RATE_LIMITED",
              retryable: false,
            },
            { status: 429 },
          ),
        )
        .mockResolvedValueOnce(Response.json({ broken: true }))
        .mockResolvedValueOnce(
          Response.json({ ...analysis, feedback_id: "wrong" }),
        ),
    );
    const updates: FeedbackRow[] = [];
    await analyzeRows(
      ["A1", "A2", "A3"].map((feedback_id) => ({
        feedback_id,
        feedback: "Great",
      })),
      (row) => updates.push(row),
    );
    expect(updates.filter((row) => row.status === "failed")).toHaveLength(3);
    expect(
      updates.find(
        (row) => row.status === "failed" && row.feedback.feedback_id === "A1",
      ),
    ).toMatchObject({ error: "AI busy" });
  });
  it("does not start requests after cancellation", async () => {
    const abort = new AbortController();
    abort.abort();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await analyzeRows(
      [{ feedback_id: "A1", feedback: "Great" }],
      vi.fn(),
      abort.signal,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
