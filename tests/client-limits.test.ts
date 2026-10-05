import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeRows,
  retryAfterSeconds,
  type BatchControl,
  type FeedbackRow,
} from "@/lib/feedback/client";
import { analysis } from "./fixtures/analysis";
const rows = Array.from({ length: 7 }, (_, i) => ({
  feedback_id: `R${i}`,
  feedback: "Good",
}));
const success = (init: RequestInit) =>
  Response.json({
    ...analysis,
    feedback_id: JSON.parse(String(init.body)).feedback_id,
  });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("coordinated rate-limit handling", () => {
  it("pauses all workers during cooldown then retries only denied rows", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let first = true;
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      if (first) {
        first = false;
        return Response.json(
          { error: "Wait", code: "RATE_LIMITED", retryable: true },
          { status: 429, headers: { "Retry-After": "1" } },
        );
      }
      return success(init);
    });
    vi.stubGlobal("fetch", fetch);
    const controls: BatchControl[] = [];
    const updates: FeedbackRow[] = [];
    const run = analyzeRows(rows, (row) => updates.push(row), undefined, {
      onControl: (control) => controls.push(control),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(controls.at(-1)?.status).toBe("coolingDown");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(await run).toEqual({ status: "complete" });
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(updates.filter((row) => row.status === "complete")).toHaveLength(7);
  });
  it.each([
    "IP_QUOTA_EXHAUSTED",
    "GLOBAL_QUOTA_EXHAUSTED",
    "PROTECTION_UNAVAILABLE",
    "ANALYSIS_DISABLED",
  ])(
    "stops dispatch for %s while draining existing successes",
    async (code) => {
      let first = true;
      const fetch = vi.fn(async (_url, init: RequestInit) => {
        if (first) {
          first = false;
          return Response.json(
            { error: "On hold", code, retryable: false },
            { status: code === "IP_QUOTA_EXHAUSTED" ? 429 : 503 },
          );
        }
        return success(init);
      });
      vi.stubGlobal("fetch", fetch);
      const updates: FeedbackRow[] = [];
      expect(await analyzeRows(rows, (row) => updates.push(row))).toMatchObject(
        { status: "blocked" },
      );
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(updates.filter((row) => row.status === "complete")).toHaveLength(
        2,
      );
      expect(
        updates.some(
          (row) => row.feedback.feedback_id === "R0" && row.status === "ready",
        ),
      ).toBe(true);
      expect(updates.some((row) => row.status === "failed")).toBe(false);
    },
  );
  it("handles HTML edge denials with a conservative cooldown and interruptible pause", async () => {
    vi.useFakeTimers();
    const pause = new AbortController();
    const fetch = vi.fn(
      async () =>
        new Response("<html>Too many requests</html>", { status: 429 }),
    );
    vi.stubGlobal("fetch", fetch);
    const controls: BatchControl[] = [];
    const run = analyzeRows(rows, () => {}, undefined, {
      pauseSignal: pause.signal,
      onControl: (control) => controls.push(control),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(controls.at(-1)?.status).toBe("coolingDown");
    expect(fetch).toHaveBeenCalledTimes(3);
    pause.abort();
    expect(await run).toMatchObject({ status: "paused" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("caps repeated pre-provider retries", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetch = vi.fn(async () =>
      Response.json(
        { error: "Busy", code: "CAPACITY_LIMITED", retryable: true },
        { status: 429, headers: { "Retry-After": "1" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const run = analyzeRows(rows.slice(0, 1), () => {});
    await vi.advanceTimersByTimeAsync(4000);
    expect(await run).toMatchObject({ status: "paused" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("pauses instead of scheduling waits longer than 60 seconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Wait", code: "RATE_LIMITED", retryable: true },
          { status: 429, headers: { "Retry-After": "61" } },
        ),
      ),
    );
    expect(await analyzeRows(rows, () => {})).toMatchObject({
      status: "paused",
    });
  });
  it("does not repeat potentially billable provider 429 responses", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: "Provider busy",
          code: "PROVIDER_RATE_LIMITED",
          retryable: false,
        },
        { status: 429 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const updates: FeedbackRow[] = [];
    expect(
      await analyzeRows(rows.slice(0, 1), (row) => updates.push(row)),
    ).toEqual({ status: "complete" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({
      status: "failed",
      error: "Provider busy",
    });
  });
  it("stops new dispatch on user pause and retains already-admitted results", async () => {
    const pause = new AbortController();
    const responses: (() => void)[] = [];
    const fetch = vi.fn(
      (_url, init: RequestInit) =>
        new Promise<Response>((resolve) =>
          responses.push(() => resolve(success(init))),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const updates: FeedbackRow[] = [];
    const run = analyzeRows(rows, (row) => updates.push(row), undefined, {
      pauseSignal: pause.signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    pause.abort();
    responses.forEach((resolve) => resolve());
    expect(await run).toMatchObject({ status: "paused" });
    expect(updates.filter((row) => row.status === "complete")).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("wakes cooldown workers when another in-flight request blocks the batch", async () => {
    vi.useFakeTimers();
    let deny: ((response: Response) => void) | undefined;
    let count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (count++ === 0)
          return Response.json(
            { error: "Wait", code: "RATE_LIMITED", retryable: true },
            { status: 429, headers: { "Retry-After": "30" } },
          );
        return new Promise<Response>((resolve) => {
          deny = resolve;
        });
      }),
    );
    const run = analyzeRows(rows.slice(0, 2), () => {});
    await vi.advanceTimersByTimeAsync(0);
    deny?.(
      Response.json(
        {
          error: "Quota exhausted",
          code: "IP_QUOTA_EXHAUSTED",
          retryable: false,
        },
        { status: 429 },
      ),
    );
    expect(await run).toMatchObject({ status: "blocked" });
  });
});

describe("Retry-After parsing", () => {
  it("accepts seconds and HTTP dates, rejects invalid inputs", () => {
    expect(retryAfterSeconds("10", 0)).toBe(10);
    expect(retryAfterSeconds("Thu, 01 Jan 1970 00:00:10 GMT", 0)).toBe(10);
    expect(retryAfterSeconds("invalid", 0)).toBeNull();
    expect(retryAfterSeconds("-1", 0)).toBeNull();
    expect(retryAfterSeconds("1.5", 0)).toBeNull();
    expect(retryAfterSeconds("31536001", 0)).toBeNull();
    expect(retryAfterSeconds("99999999999999999999", 0)).toBeNull();
    expect(retryAfterSeconds(null, 0)).toBeNull();
  });
});
