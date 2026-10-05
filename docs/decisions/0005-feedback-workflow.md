# 0005: Validated uploads and individual feedback analysis

- Status: Accepted
- Date: 2026-10-04

## Decision

Use a shared Zod contract for CSV, Excel and server input. Required columns are `feedback_id` and `feedback`; optional columns are `date`, `service` and `rating`. Reject unexpected or duplicate headers, duplicate IDs, invalid fields, malformed files and uploads over 100 nonempty feedback rows or 2 MB. Optional blanks become absent values. Excel reads the first worksheet; older `.xls` files must be saved as `.xlsx`.

Parse CSV using PapaParse and Excel using read-excel-file in the browser. Validate the entire file before allowing submission. Present an accessible preview, row and column errors, and a Sonner toast linking to the sample guide. Supply a downloadable sample CSV and matching in-app rows.

On explicit submission, process each row through `POST /api/feedback/analyze`, with at most three browser requests in flight. Revalidate server input, keep credentials server-only, reject cross-origin browser calls, bound request size and provider timeouts, and sanitize errors. Send only feedback text, service and rating to TypeSafe; IDs and dates stay out of provider state. Validate provider classifications and confidence at runtime. Retry failed rows without repeating successful analysis.

## Rubric and ownership

TypeSafe answers five typed choice questions: happiness, main topic, impact, urgency and suggested action. The application owns rubric descriptions, action guidance and summary counts. Happiness can be happy, unhappy, mixed, neutral or unclear. Impact and urgency require evidence in the feedback; emotion alone does not imply critical harm. The lowest reported answer confidence is displayed; below 70% or unclear happiness requires human review. Provider confidence is not a calibrated accuracy guarantee.

Show original feedback beside each result. Aggregate only successful analyses and label the denominator; topic counts describe the uploaded sample, not historical trends. Actions are suggestions from an explicit rubric, requiring human judgment.

## Architecture delta and constraints

Retain Next.js App Router, React, strict TypeScript, Tailwind/shadcn, Node.js 24 and the Vercel target. Add Zod, PapaParse, read-excel-file and Sonner, plus Vitest, Testing Library, jsdom, PapaParse types and Prettier for verification. No database, persistent upload storage, authentication or background jobs. Files and results remain in browser memory and clear on refresh; requests cross the existing TypeSafe trust boundary only after submission.

This version targets local use. Same-origin checks and browser concurrency limits are not authentication or a distributed quota. Public production exposure requires access control and server-side rate limiting before deployment. No deployment is performed in this change.

## Verification

Cover input contract edge cases, actual Excel workbook parsing, API validation and sanitized failures, provider-result validation, bounded concurrency, UI upload/submit/retry behavior. Run tests, lint, formatting, typecheck and production build. Manually verify the local browser against the real TypeSafe endpoint with sample feedback.
