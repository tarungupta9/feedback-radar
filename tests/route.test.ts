// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/feedback/analyze", () => ({ analyzeFeedback: vi.fn() }));
vi.mock("@/lib/abuse/admission", () => ({ admitAnalysis: vi.fn() }));
import { admitAnalysis } from "@/lib/abuse/admission";
import { analyzeFeedback } from "@/lib/feedback/analyze";
import { POST } from "@/app/api/feedback/analyze/route";
const valid = { feedback_id: "A1", feedback: "Great" };
const request = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/feedback/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("ANALYSIS_ENABLED", "true");
  vi.mocked(admitAnalysis).mockResolvedValue({
    allowed: true,
    release: vi.fn().mockResolvedValue(undefined),
  });
});

describe("analysis admission", () => {
  it.each([
    ["rate", 429, "RATE_LIMITED"],
    ["capacity", 429, "CAPACITY_LIMITED"],
    ["ip_quota", 429, "IP_QUOTA_EXHAUSTED"],
    ["global_quota", 503, "GLOBAL_QUOTA_EXHAUSTED"],
  ] as const)(
    "blocks %s before provider execution",
    async (reason, status, code) => {
      vi.mocked(admitAnalysis).mockResolvedValue({
        allowed: false,
        reason,
        retryAfterSeconds: 60,
        resumeAt: "2026-10-06T00:00:00.000Z",
      });
      const response = await POST(request(JSON.stringify(valid)));
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(await response.json()).toMatchObject({ code });
      expect(analyzeFeedback).not.toHaveBeenCalled();
    },
  );
  it("fails closed on uncertain admission and sanitizes failures", async () => {
    vi.mocked(admitAnalysis).mockRejectedValue(new Error("SECRET Redis token"));
    const response = await POST(request(JSON.stringify(valid)));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "PROTECTION_UNAVAILABLE",
    });
    expect(analyzeFeedback).not.toHaveBeenCalled();
  });
  it("disables analysis without contacting admission storage", async () => {
    vi.stubEnv("ANALYSIS_ENABLED", "false");
    expect((await POST(request(JSON.stringify(valid)))).status).toBe(503);
    expect(admitAnalysis).not.toHaveBeenCalled();
    expect(analyzeFeedback).not.toHaveBeenCalled();
  });
  it("releases capacity after a provider failure", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    vi.mocked(admitAnalysis).mockResolvedValue({ allowed: true, release });
    vi.mocked(analyzeFeedback).mockRejectedValue(new Error("provider error"));
    expect((await POST(request(JSON.stringify(valid)))).status).toBe(502);
    expect(release).toHaveBeenCalledOnce();
  });
  it("retains successful results when lease cleanup fails", async () => {
    vi.mocked(admitAnalysis).mockResolvedValue({
      allowed: true,
      release: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    });
    vi.mocked(analyzeFeedback).mockResolvedValue({
      feedback_id: "A1",
    } as Awaited<ReturnType<typeof analyzeFeedback>>);
    expect((await POST(request(JSON.stringify(valid)))).status).toBe(200);
  });
  it("validates input without consuming admission allowance", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect(admitAnalysis).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("server trust boundary", () => {
  it.each([
    "{",
    JSON.stringify({ ...valid, rating: 6 }),
    JSON.stringify({ ...valid, feedback: "" }),
    JSON.stringify({ ...valid, extra: "bad" }),
  ])("rejects invalid input before AI", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(analyzeFeedback).not.toHaveBeenCalled();
  });
  it("rejects oversized requests and other origins", async () => {
    expect((await POST(request("x".repeat(32001)))).status).toBe(413);
    expect(
      (
        await POST(
          request(JSON.stringify(valid), { Origin: "https://other.example" }),
        )
      ).status,
    ).toBe(403);
    expect(analyzeFeedback).not.toHaveBeenCalled();
  });
  it("returns a configuration error without calling the provider", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect((await POST(request(JSON.stringify(valid)))).status).toBe(503);
    expect(analyzeFeedback).not.toHaveBeenCalled();
  });
  it("returns analysis and sanitizes provider failures", async () => {
    vi.mocked(analyzeFeedback).mockResolvedValueOnce({
      feedback_id: "A1",
      happiness: "happy",
      topic: "support",
      impact: "minor",
      urgency: "routine",
      action: "thank",
      confidence: 0.9,
      needsReview: false,
    });
    expect((await POST(request(JSON.stringify(valid)))).status).toBe(200);
    vi.mocked(analyzeFeedback).mockRejectedValueOnce(
      new Error("SECRET customer details"),
    );
    const response = await POST(request(JSON.stringify(valid)));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET");
  });
});
