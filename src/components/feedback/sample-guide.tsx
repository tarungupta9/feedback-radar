import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";

export function SampleGuide() {
  return (
    <Card id="sample" className="scroll-mt-8">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              <h2
                id="sample-heading"
                tabIndex={-1}
                className="text-lg focus-visible:outline-2"
              >
                Start with the right format
              </h2>
            </CardTitle>
            <CardDescription>
              One row per customer feedback. Same headers for CSV and Excel.
            </CardDescription>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <a href="/sample-feedback.csv" download>
              <Download aria-hidden="true" />
              Download sample CSV
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableCaption className="sr-only">
            Required and optional upload columns
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Column</TableHead>
              <TableHead scope="col">Required?</TableHead>
              <TableHead scope="col">Expected value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["feedback_id", "Yes", "Unique text ID, up to 100 characters"],
              ["feedback", "Yes", "Customer feedback, 1–5,000 characters"],
              ["date", "No", "YYYY-MM-DD, for example 2026-10-01"],
              [
                "service",
                "No",
                "Service or product name, up to 200 characters",
              ],
              ["rating", "No", "Whole number from 1 to 5"],
            ].map(([column, required, value]) => (
              <TableRow key={column}>
                <TableCell className="font-mono text-xs">{column}</TableCell>
                <TableCell>{required}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Keep these header names; optional columns can be omitted or left
          blank. Quote CSV feedback containing commas or line breaks. Excel
          reads the first worksheet; format IDs as text and dates as YYYY-MM-DD.
        </p>
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium focus-visible:outline-2">
            View sample rows
          </summary>
          <Table className="mt-3">
            <TableCaption className="sr-only">Sample CSV contents</TableCaption>
            <TableHeader>
              <TableRow>
                {["feedback_id", "feedback", "date", "service", "rating"].map(
                  (header) => (
                    <TableHead
                      scope="col"
                      key={header}
                      className="font-mono text-xs"
                    >
                      {header}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                [
                  "F001",
                  "Friendly support, resolved my issue quickly.",
                  "2026-10-01",
                  "Support",
                  "5",
                ],
                [
                  "F002",
                  "Charged twice and still waiting for a refund.",
                  "2026-10-02",
                  "Billing",
                  "1",
                ],
                [
                  "F003",
                  "Helpful team, but delivery was late.",
                  "2026-10-03",
                  "Delivery",
                  "3",
                ],
              ].map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, i) => (
                    <TableCell key={i} className="min-w-20">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <FileSpreadsheet aria-hidden="true" className="size-4 shrink-0" />
          CSV or .xlsx · Up to 100 rows · Maximum 2 MB · Save .xls files as
          .xlsx.
        </p>
      </CardContent>
    </Card>
  );
}
