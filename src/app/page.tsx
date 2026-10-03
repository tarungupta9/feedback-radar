import { ArrowUpRight, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16 sm:px-8">
      <header className="space-y-5">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Radar aria-hidden="true" className="size-6" />
          <span>Feedback Radar</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Make sense of customer feedback.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
          Feedback Radar is taking shape. A place to understand what customers
          are saying and decide what comes next.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl">The foundation is ready</h2>
          </CardTitle>
          <CardDescription>
            Feedback collection and analysis are coming next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-muted-foreground">
            This is the starting point for Feedback Radar. There is no feedback
            data here yet.
          </p>
        </CardContent>
      </Card>

      <footer>
        <Button asChild variant="outline">
          <a href="https://github.com/typesafe-ai/typesafe-sdk-js">
            Explore TypeSafe AI
            <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      </footer>
    </main>
  );
}
