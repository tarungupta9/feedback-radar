# 0006: A focused workspace and separate how-to page

- Status: Accepted
- Date: 2026-10-04

## Context and decision

The single page mixed upload controls, file-format instructions, preview, results and assessment guidance. On smaller screens, the guide pushed the preview and results out of view. The native file input also appeared empty after selection, despite a validated file being available.

Keep upload, processing and results on `/`, presenting one primary view at a time. Place preparation instructions, sample files, assessment rules and data handling on `/guide`. Offer guide links in navigation, upload, validation errors and results. Reading the guide is optional.

Show a validated filename and original-content preview together before analysis. Initially show five rows, with an accessible action to view all rows. Hide AI columns until results exist. Processing shows real completion counts, then results replace the upload view. Keep summary counts and priorities visible; make sentiment and topic breakdowns expandable. Retry only failed rows while retaining successful insights.

## State and ownership

Move the existing browser workflow state and request lifecycle into a React provider in the shared root layout. Navigating between workspace and guide preserves the upload and allows processing to continue. Route components render the current view without owning or aborting requests. Unmounting the provider aborts pending requests and invalidates pending parsing.

Starting another upload keeps a previous-result snapshot in memory until a replacement validates. Invalid replacements do not erase that snapshot; the user can return to previous results. Refresh clears all state as before.

## Architecture delta and alternatives

Add `/guide`, shared client state ownership, and modular upload-preview, processing and results components. Retain every parsing, validation, rubric, provider, concurrency and API decision from [0005](0005-feedback-workflow.md). No new dependencies, services, storage locations, background jobs, runtime integrations or external trust boundaries. Build and deployment remain Next.js on Node.js 24 with the existing Vercel target; this change does not deploy.

A third results route was considered; the user chose a single workspace for upload and results. A mandatory how-to step was rejected because prepared users should upload immediately. Persistent upload history remains outside scope. Revisit memory-only state if refresh recovery or saved analyses become a product requirement.

## Verification

Test original-content previews, longer files, optional columns, repeated file selection, validation recovery, processing progress, guide navigation, partial and total failures, retries, replacement recovery and refresh behavior. Verify navigation and responsive layout in the browser. Run tests, lint, formatting checks, typecheck and build.
