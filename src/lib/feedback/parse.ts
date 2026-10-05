import Papa from "papaparse";
import { MAX_FILE_BYTES, UploadError, validateRows } from "./schema";

export function parseCsv(text: string) {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    skipEmptyLines: false,
  });
  if (result.errors.length) {
    throw new UploadError(
      result.errors.map((error) => ({
        row: error.row === undefined ? undefined : error.row + 1,
        message: error.message,
      })),
    );
  }
  return validateRows(result.data);
}

export async function parseFeedbackFile(file: File) {
  if (file.size > MAX_FILE_BYTES)
    throw new UploadError([{ message: "File exceeds the 2 MB limit." }]);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx")
    throw new UploadError([
      {
        message: "Choose a .csv or .xlsx file. Save older .xls files as .xlsx.",
      },
    ]);
  try {
    if (extension === "csv") return parseCsv(await file.text());
    const { readSheet } = await import("read-excel-file/browser");
    return validateRows(await readSheet(file, 1));
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError([
      {
        message:
          "File could not be read. Export a fresh CSV or .xlsx workbook and try again.",
      },
    ]);
  }
}
