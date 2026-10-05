import { z } from "zod";

export const MAX_ROWS = 100;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const columns = [
  "feedback_id",
  "feedback",
  "date",
  "service",
  "rating",
] as const;

export const feedbackSchema = z.strictObject({
  feedback_id: z.string().trim().min(1, "Required").max(100),
  feedback: z.string().trim().min(1, "Required").max(5000),
  date: z.iso.date().optional(),
  service: z.string().trim().min(1).max(200).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export interface UploadIssue {
  row?: number;
  column?: string;
  message: string;
}

export class UploadError extends Error {
  constructor(public readonly issues: UploadIssue[]) {
    super("Invalid file format. Compare your file with the sample.");
    this.name = "UploadError";
  }
}

/** CSV and Excel share one contract. Empty optional cells become absent values. */
export function validateRows(rows: unknown[][]): Feedback[] {
  const [header, ...body] = rows;
  if (!header?.length) throw new UploadError([{ message: "File is empty." }]);
  const headers = header.map((cell) =>
    typeof cell === "string" ? cell.trim().replace(/^\uFEFF/, "") : "",
  );
  const issues: UploadIssue[] = [];
  const seenHeaders = new Set<string>();
  for (const name of headers) {
    if (!columns.some((column) => column === name))
      issues.push({
        row: 1,
        column: name || "(blank)",
        message: "Unknown column.",
      });
    if (seenHeaders.has(name))
      issues.push({ row: 1, column: name, message: "Duplicate column." });
    seenHeaders.add(name);
  }
  for (const name of ["feedback_id", "feedback"]) {
    if (!seenHeaders.has(name))
      issues.push({
        row: 1,
        column: name,
        message: "Required column is missing.",
      });
  }
  if (issues.length) throw new UploadError(issues);

  const records: Feedback[] = [];
  const ids = new Set<string>();
  let count = 0;
  for (const [index, cells] of body.entries()) {
    if (
      cells.every(
        (cell) => cell == null || (typeof cell === "string" && !cell.trim()),
      )
    )
      continue;
    count++;
    const row = index + 2;
    if (count > MAX_ROWS)
      throw new UploadError([
        { message: `Maximum ${MAX_ROWS} feedback rows per file.` },
      ]);
    // Excel omits trailing blank cells. Missing CSV required values still fail Zod.
    if (cells.length > headers.length) {
      issues.push({
        row,
        message: "More cells than headers. Quote feedback containing commas.",
      });
      continue;
    }
    const raw: Record<string, unknown> = {};
    headers.forEach((name, column) => {
      let value = cells[column];
      if (typeof value === "string") value = value.trim();
      if (value == null || value === "") return;
      if (
        name === "date" &&
        value instanceof Date &&
        !Number.isNaN(value.getTime())
      )
        value = value.toISOString().slice(0, 10);
      if (
        name === "rating" &&
        typeof value === "string" &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
      )
        value = Number(value);
      raw[name] = value;
    });
    const result = feedbackSchema.safeParse(raw);
    if (!result.success) {
      issues.push(
        ...result.error.issues.map((issue) => ({
          row,
          column: String(issue.path[0]),
          message: issue.message,
        })),
      );
      continue;
    }
    if (ids.has(result.data.feedback_id))
      issues.push({
        row,
        column: "feedback_id",
        message: "ID must be unique within the file.",
      });
    ids.add(result.data.feedback_id);
    records.push(result.data);
  }
  if (!count)
    issues.push({
      message: "Add at least one feedback row below the headers.",
    });
  if (issues.length) throw new UploadError(issues);
  return records;
}
