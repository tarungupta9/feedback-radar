import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { InsightsSummary } from "@/components/feedback/insights-summary";
import type { Analysis } from "@/lib/feedback/rubric";

it("puts rare urgent actions ahead of frequent praise and labels the analyzed denominator", () => {
  const base: Analysis = {
    feedback_id: "A1",
    happiness: "happy",
    topic: "support",
    impact: "minor",
    urgency: "routine",
    action: "thank",
    confidence: 0.9,
    needsReview: false,
  };
  const results = [
    base,
    { ...base, feedback_id: "A2" },
    {
      ...base,
      feedback_id: "A3",
      happiness: "unhappy" as const,
      impact: "critical" as const,
      urgency: "immediate" as const,
      action: "escalate" as const,
    },
  ];
  render(<InsightsSummary results={results} total={5} />);
  const heading = screen.getByRole("heading", { name: "Where to start" });
  const items = within(heading.parentElement!).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Escalate");
  expect(screen.getByText("2 of 3 analyzed rows")).toBeInTheDocument();
  expect(screen.getByText("3 / 5")).toBeInTheDocument();
});

it("keeps priorities visible and reveals sentiment and topic details on demand", async () => {
  const user = userEvent.setup();
  render(
    <InsightsSummary
      results={[
        {
          feedback_id: "A1",
          happiness: "happy",
          topic: "support",
          impact: "minor",
          urgency: "routine",
          action: "thank",
          confidence: 0.9,
          needsReview: false,
        },
      ]}
      total={1}
    />,
  );
  expect(screen.getByRole("heading", { name: "Where to start" })).toBeVisible();
  const toggle = screen.getByText("Explore sentiment and topic breakdowns");
  const details = toggle.closest("details")!;
  expect(details).not.toHaveAttribute("open");
  await user.click(toggle);
  expect(details).toHaveAttribute("open");
  expect(
    screen.getByRole("heading", { name: "How customers feel" }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Topics in this upload" }),
  ).toBeVisible();
  await user.click(toggle);
  expect(details).not.toHaveAttribute("open");
});
