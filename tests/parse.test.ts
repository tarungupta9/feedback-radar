import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, parseFeedbackFile } from "@/lib/feedback/parse";
import { validateRows, UploadError } from "@/lib/feedback/schema";
import { sampleCsv } from "@/lib/feedback/sample";

describe("feedback file contract", () => {
  it("keeps the downloadable sample valid and equal to in-app sample", () => {
    expect(readFileSync("public/sample-feedback.csv", "utf8")).toBe(sampleCsv);
    expect(parseCsv(sampleCsv)).toHaveLength(3);
  });
  it("handles BOM, CRLF, quoted commas, escaped quotes and multiline feedback", () => {
    const rows = parseCsv(
      '\uFEFFfeedback_id,feedback\r\nA1,"Good, but ""slow""\r\nPlease improve"\r\n',
    );
    expect(rows[0].feedback).toBe('Good, but "slow"\r\nPlease improve');
  });
  it("allows optional blanks, reordered columns and empty rows", () => {
    expect(
      parseCsv("rating,feedback,feedback_id,date,service\n,Great,A1,,\n\n"),
    ).toEqual([{ feedback_id: "A1", feedback: "Great" }]);
  });
  it.each([
    ["empty file", ""],
    ["headers only", "feedback_id,feedback\n"],
    ["missing column", "feedback\nGreat"],
    ["unknown column", "feedback_id,feedback,typo\nA1,Great,x"],
    ["duplicate header", "feedback_id,feedback,feedback\nA1,Great,Great"],
    ["duplicate IDs", "feedback_id,feedback\nA1,Great\nA1,Bad"],
    ["blank feedback", "feedback_id,feedback\nA1, "],
    ["invalid date", "feedback_id,feedback,date\nA1,Good,2026-02-30"],
    ["out of range rating", "feedback_id,feedback,rating\nA1,Good,6"],
    ["fractional rating", "feedback_id,feedback,rating\nA1,Good,2.5"],
    ["unquoted comma", "feedback_id,feedback\nA1,Good,but late"],
    ["unclosed quote", 'feedback_id,feedback\nA1,"Good'],
  ])("rejects %s", (_, csv) =>
    expect(() => parseCsv(csv)).toThrow(UploadError),
  );
  it("reports useful row and column for a bad field", () => {
    try {
      parseCsv("feedback_id,feedback,rating\nA1,Good,0");
      throw new Error("Should reject");
    } catch (error) {
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).issues[0]).toMatchObject({
        row: 2,
        column: "rating",
      });
    }
  });
  it("enforces row and text length limits", () => {
    expect(() =>
      parseCsv(
        "feedback_id,feedback\n" +
          Array.from({ length: 101 }, (_, i) => `A${i},Good`).join("\n"),
      ),
    ).toThrow(/Invalid file/);
    expect(() =>
      parseCsv(`feedback_id,feedback\nA1,${"x".repeat(5001)}`),
    ).toThrow(UploadError);
  });
  it("normalizes Excel dates and numeric ratings but requires text IDs", () => {
    expect(
      validateRows([
        ["feedback_id", "feedback", "date", "rating"],
        ["A1", "Great", new Date("2026-10-01T00:00:00Z"), 5],
      ])[0],
    ).toMatchObject({ date: "2026-10-01", rating: 5 });
    expect(() =>
      validateRows([
        ["feedback_id", "feedback"],
        [123, "Great"],
      ]),
    ).toThrow(UploadError);
  });
  it("rejects large files and older Excel formats before reading", async () => {
    await expect(
      parseFeedbackFile(
        new File(["x".repeat(2 * 1024 * 1024 + 1)], "large.csv"),
      ),
    ).rejects.toBeInstanceOf(UploadError);
    await expect(
      parseFeedbackFile(new File(["x"], "old.xls")),
    ).rejects.toBeInstanceOf(UploadError);
  });
  it("parses an actual Excel workbook through the browser reader", async () => {
    const bytes = readFileSync("tests/fixtures/feedback.xlsx");
    const file = new File([new Uint8Array(bytes)], "feedback.xlsx");
    const rows = await parseFeedbackFile(file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      feedback_id: "X001",
      feedback: "Great service",
      date: "2026-10-01",
      service: "Support",
      rating: 5,
    });
  });
  it("rejects corrupt Excel with an actionable format error", async () => {
    await expect(
      parseFeedbackFile(new File(["not a workbook"], "corrupt.xlsx")),
    ).rejects.toMatchObject({
      issues: [{ message: expect.stringContaining("Export a fresh CSV") }],
    });
  });
});
