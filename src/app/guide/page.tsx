import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SampleGuide } from "@/components/feedback/sample-guide";
import { rubricGuide } from "@/lib/feedback/rubric";

export const metadata: Metadata = { title: "How it works · Feedback Radar" };

export default function GuidePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 sm:px-8 sm:py-10"
    >
      <Button asChild variant="ghost" className="min-h-11">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to your feedback
        </Link>
      </Button>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          How Feedback Radar works
        </h1>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          Prepare your feedback once. Upload, preview and analyze it in one
          place.
        </p>
      </div>
      <ol
        aria-label="How to analyze feedback"
        className="grid gap-4 sm:grid-cols-3"
      >
        {[
          [
            "1. Prepare your file",
            "One customer response per row. Include feedback_id and feedback; other columns are optional.",
          ],
          [
            "2. Upload and review",
            "Choose a CSV or Excel file. We validate its format and show a preview before anything is sent for analysis.",
          ],
          [
            "3. Analyze and act",
            "Start analysis when you’re ready. Review priorities and individual results; retry any failed rows.",
          ],
        ].map(([title, description]) => (
          <li key={title} className="space-y-2 border-t pt-4">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </li>
        ))}
      </ol>
      <SampleGuide />
      <Card id="assessment" className="scroll-mt-8">
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">How we assess feedback</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {rubricGuide.map(([label, description]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Recommendations come from a defined action rubric. Confidence is the
            provider’s reported certainty, not a guarantee. Human review is
            especially important for ambiguous or high-impact feedback.
          </p>
        </CardContent>
      </Card>
      <section
        aria-labelledby="data-heading"
        className="space-y-2 rounded-xl border p-5 text-sm"
      >
        <h2 id="data-heading" className="font-semibold">
          What happens to your data
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          Files are parsed and validated in your browser. Only after you start
          analysis do we send feedback text, service and rating to TypeSafe AI.
          IDs and dates are not sent to the AI provider.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          Your upload and results remain available when you move between these
          pages. They stay in this tab’s memory and clear on refresh. There is
          no saved upload history.
        </p>
      </section>
      <Button
        asChild
        className="min-h-11 bg-indigo-700 text-white hover:bg-indigo-800"
      >
        <Link href="/">
          Go to your feedback
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </main>
  );
}
