// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { systemOne } = vi.hoisted(() => ({ systemOne: vi.fn() }));
vi.mock("@/lib/typesafe", () => ({ getTypeSafeClient: () => ({ systemOne }) }));
import { analyzeFeedback } from "@/lib/feedback/analyze";
const answers = {
  happiness: { choice: "happy", confidence: 0.95 },
  topic: { choice: "support", confidence: 0.8 },
  impact: { choice: "minor", confidence: 0.9 },
  urgency: { choice: "routine", confidence: 0.88 },
  action: { choice: "thank", confidence: 0.94 },
};
beforeEach(() => vi.clearAllMocks());
describe("TypeSafe rubric integration", () => {
  it("sends only necessary context and derives confidence across all dimensions", async () => {
    systemOne.mockResolvedValue({ answers });
    const result = await analyzeFeedback({
      feedback_id: "private-id",
      feedback: "Great",
      date: "2026-10-01",
      service: "Support",
      rating: 5,
    });
    expect(systemOne.mock.calls[0][0].state).toEqual({
      feedback: "Great",
      service: "Support",
      rating: 5,
    });
    expect(result).toMatchObject({
      feedback_id: "private-id",
      confidence: 0.8,
      needsReview: false,
    });
    expect(systemOne.mock.calls[0][1]).toMatchObject({
      timeout: 20000,
      retry: { maxRetries: 0 },
    });
  });
  it("flags uncertainty or unclear happiness for human review", async () => {
    systemOne.mockResolvedValueOnce({
      answers: { ...answers, topic: { choice: "other", confidence: 0.5 } },
    });
    expect(
      (await analyzeFeedback({ feedback_id: "A1", feedback: "Great" }))
        .needsReview,
    ).toBe(true);
    systemOne.mockResolvedValueOnce({
      answers: {
        ...answers,
        happiness: { choice: "unclear", confidence: 0.95 },
      },
    });
    expect(
      (await analyzeFeedback({ feedback_id: "A1", feedback: "Hmm" }))
        .needsReview,
    ).toBe(true);
  });
  it("rejects unsupported classifications and invalid provider confidence", async () => {
    systemOne.mockResolvedValueOnce({
      answers: { ...answers, impact: { choice: "invented", confidence: 0.9 } },
    });
    await expect(
      analyzeFeedback({ feedback_id: "A1", feedback: "Great" }),
    ).rejects.toThrow();
    systemOne.mockResolvedValueOnce({
      answers: { ...answers, topic: { choice: "support", confidence: 1.5 } },
    });
    await expect(
      analyzeFeedback({ feedback_id: "A1", feedback: "Great" }),
    ).rejects.toThrow();
  });
});
