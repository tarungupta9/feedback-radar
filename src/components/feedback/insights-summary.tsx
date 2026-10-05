import { Card, CardContent } from "@/components/ui/card";
import type { Analysis } from "@/lib/feedback/rubric";
import { happiness, topics, actions } from "@/lib/feedback/rubric";

export function InsightsSummary({
  results,
  total,
}: {
  results: Analysis[];
  total: number;
}) {
  if (!results.length) return null;
  const happy = results.filter((row) => row.happiness === "happy").length;
  const urgent = results.filter(
    (row) => row.urgency === "immediate" || row.impact === "critical",
  ).length;
  const review = results.filter((row) => row.needsReview).length;
  const topicCounts = Object.keys(topics)
    .map((key) => {
      const topic = key as Analysis["topic"];
      return {
        topic,
        count: results.filter((row) => row.topic === topic).length,
      };
    })
    .filter((item) => item.count)
    .sort((a, b) => b.count - a.count);
  const actionCounts = Object.keys(actions)
    .map((key) => {
      const action = key as Analysis["action"];
      const matching = results.filter((row) => row.action === action);
      return {
        action,
        count: matching.length,
        priority: Math.max(
          0,
          ...matching.map((row) =>
            row.urgency === "immediate" || row.impact === "critical"
              ? 3
              : row.impact === "major"
                ? 2
                : row.urgency === "soon" || row.impact === "moderate"
                  ? 1
                  : 0,
          ),
        ),
      };
    })
    .filter((item) => item.count)
    .sort((a, b) => b.priority - a.priority || b.count - a.count);
  return (
    <section aria-label="Feedback insights" className="space-y-4">
      <h2 className="sr-only">Analysis overview</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            "Analyzed",
            `${results.length} / ${total}`,
            "Successfully processed feedback",
          ],
          [
            "Happy feedback",
            `${Math.round((happy / results.length) * 100)}%`,
            `${happy} of ${results.length} analyzed rows`,
          ],
          [
            "Immediate attention",
            String(urgent),
            "Immediate urgency or critical impact",
          ],
          [
            "Human review",
            String(review),
            "Unclear happiness or confidence below 70%",
          ],
        ].map(([label, value, detail]) => (
          <Card key={label}>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-semibold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <h3 className="mb-2 font-medium">Where to start</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Prioritized by urgency and impact, then frequency.
          </p>
          <ol className="grid gap-4 sm:grid-cols-3">
            {actionCounts.slice(0, 3).map(({ action, count }, index) => (
              <li key={action} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-medium text-indigo-800"
                >
                  {index + 1}
                </span>
                <div>
                  <p>{actions[action]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggested for {count} feedback{" "}
                    {count === 1 ? "row" : "rows"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <details className="rounded-xl border p-4">
        <summary className="min-h-11 cursor-pointer content-center rounded-lg text-sm font-medium focus-visible:outline-2">
          Explore sentiment and topic breakdowns
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent>
              <h3 className="mb-3 font-medium">How customers feel</h3>
              <ul className="space-y-2 text-sm">
                {Object.entries(happiness).map(([key, label]) => (
                  <li key={key} className="flex justify-between gap-3">
                    <span>{label}</span>
                    <span className="font-medium">
                      {results.filter((row) => row.happiness === key).length}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h3 className="mb-3 font-medium">Topics in this upload</h3>
              <ul className="space-y-2 text-sm">
                {topicCounts.map(({ topic, count }) => (
                  <li key={topic} className="flex justify-between gap-3">
                    <span>{topics[topic]}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Counts describe this upload, not trends over time.
              </p>
            </CardContent>
          </Card>
        </div>
      </details>
    </section>
  );
}
