# Feedback Radar

Upload CSV or Excel feedback, validate the format, then analyze each customer response with TypeSafe AI. See original feedback, customer happiness, topics, impact, urgency, suggested actions and confidence in one table. Summaries count successfully analyzed feedback only.

## Stack

- Next.js App Router, React, and strict TypeScript
- Tailwind CSS v4 and local shadcn/ui components (Radix Nova, neutral theme)
- `@typesafe-ai/sdk` behind a server-only integration module
- npm with a committed lockfile; Node.js 24 LTS
- Vercel as the deployment target

Rationale and revisit conditions live in [docs/decisions](docs/decisions/README.md).

## Local development

Use Node.js 24 (`nvm use` if you use nvm), then:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Upload validation and previews work without an API key. Analysis needs a configured key.

To enable analysis, copy `.env.example` to `.env.local`, set `TYPESAFE_API_KEY` and configure the server-only protection settings below. Never prefix secrets with `NEXT_PUBLIC_` or commit the local file. For local `npm run dev`, explicitly set `RATE_LIMIT_LOCAL_IDENTITY=true`; this uses a shared loopback identity while still enforcing Redis quotas.

## Checks

```sh
npm run test
npm run lint
npm run format:check
npm run typecheck
npm run build
```

`typecheck` generates Next.js route types before running TypeScript, so it also works on a clean checkout. To serve the production build, run `npm run start`.

In restricted execution environments, Turbopack's CSS worker may fail with `binding to a port` / `Operation not permitted`. Use the supported fallback `npm run build -- --webpack` (or `npm run dev -- --webpack` for development). During initial setup, lint, typecheck, the Webpack production build, SDK configuration checks, and a localhost production HTTP smoke check passed; the default Turbopack build remained blocked by that environment restriction.

## Project structure

```text
src/app/              Routes, root layout, global theme
src/components/ui/    shadcn component source
src/lib/utils.ts      Shared class-merging utility
src/lib/typesafe.ts   Lazy server-only TypeSafe client
docs/decisions/       Evolving architecture decision records
```

## Upload format and workflow

Required columns: `feedback_id` (unique text, max 100 characters), `feedback` (1–5,000 characters). Optional: `date` (valid YYYY-MM-DD), `service` (text, max 200 characters), `rating` (integer 1–5). Optional columns may be omitted or blank. Unknown/duplicate headers, duplicate IDs and invalid rows block the whole upload. Limits: 100 nonempty feedback rows and 2 MB.

Download [sample-feedback.csv](public/sample-feedback.csv), or use **Try the sample data** in the app. The separate **How it works** page at `/guide` shows column rules and sample rows. Upload, processing and results share `/`; the page switches views so results take priority. Guide visits preserve the current upload and continue any running analysis. CSV feedback containing commas, quotes or line breaks must use CSV quoting. Excel `.xlsx` reads the first worksheet; keep IDs as text and format dates as YYYY-MM-DD. Save legacy `.xls` files as `.xlsx` first.

1. Choose or drop a CSV/.xlsx file.
2. Fix any row/column errors; the error panel links directly to the sample format on the guide page.
3. Review the validated feedback preview.
4. Click **Analyze** (the button includes the row count) to send feedback, service and rating to TypeSafe AI.
5. Review classifications, suggested actions and summary counts. Retry failed rows without repeating successful requests.

AI assesses happiness (including mixed/unclear), main topic, impact, urgency and a defined next action. Confidence is the lowest reported confidence across those five answers. Unclear happiness or confidence below 70% gets a human-review flag. Confidence is not an accuracy guarantee. Recommendations require human judgment; the rubric is available on the How it works page. Suggested actions are prioritized by urgency and impact, then frequency.

Use **Analyze another file** to start a new upload. **Back to previous results** restores the previous batch until a replacement file validates. Files and results stay in browser memory and clear on refresh. No database or upload history is implemented. Only the server imports `getTypeSafeClient()`; server input and provider output are validated at runtime. Requests have size limits, cancellation and bounded timeouts. Missing credentials, provider failures and timeouts produce actionable row errors without leaking provider request details.

Analysis has server-side rate, daily quota and concurrency protection. Anonymous access remains supported; shared-network users share an IP allowance and clients can rotate addresses. Bot verification and anonymous-session limits are deferred. Same-origin checking and browser concurrency are supplementary controls. Public deployment still requires Redis configuration, reviewed quotas and the WAF rule below. No deployment is performed here.

## Analysis protection

The analysis route validates feedback before reserving allowance in Redis. One atomic admission script checks a token bucket (burst 20, refill 2/second), an IP daily quota (500), a required global daily quota, and active-call limits (6/IP, 20 globally). Daily quotas reset at midnight UTC, displayed locally. Each admitted row consumes one daily attempt, including provider failures and timeouts; rejected or invalid requests do not consume daily allowance. Active-call leases release on settlement and expire after 45 seconds if cleanup fails. Redis contains only pseudonymous HMAC network identifiers, counters, timestamps and random lease IDs, never feedback or results.

Configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_IDENTITY_SECRET` (at least 32 random characters), `RATE_LIMIT_NAMESPACE` and `RATE_LIMIT_GLOBAL_DAILY`. Keep the namespace and HMAC secret stable across deployments so counters remain shared. Vercel requires a namespace prefixed with its environment (`production-` or `preview-`). Prefer separate production and preview databases and provider credentials. Use one authoritative database near the function region; admission keys share one Redis hash tag. Never use deployment-specific namespaces or independent regional admission counters.

`RATE_LIMIT_GLOBAL_DAILY` has no default: choose it from your budget and conservative provider attempt cost. Request quotas are operational controls, not an exact currency billing ceiling; assess Redis consistency/recovery and provider-enforced spending restrictions. See [the architecture decision](docs/decisions/0007-anonymous-rate-limiting.md).

All policy values can be overridden with the `RATE_LIMIT_*` settings in `.env.example`. Missing/invalid protection settings, untrusted ingress and Redis errors return 503 before AI execution. Set `ANALYSIS_ENABLED=false` to disable new analysis. Builds, upload validation and existing browser-held results remain usable. The local identity flag is accepted only outside Vercel, in development, at loopback URLs; it never bypasses quotas. Production trusts only the platform-established `x-vercel-forwarded-for` header at direct Vercel ingress. Revisit this strategy before adding another proxy or hosting platform.

The browser shares cooldowns across its three workers, follows `Retry-After`, and pauses after three automatic retries or waits longer than 60 seconds. Edge HTML 429 responses receive a conservative fallback cooldown. Daily quota or protection failures stop new dispatch while active calls settle. Remaining rows stay pending; **Resume remaining feedback** never repeats successful rows. Provider errors retain manual row retry because a failed provider call may have incurred cost. **Pause analysis** stops new requests and waits for current calls to settle. Refresh still clears browser-held feedback/results.

### Real Redis verification

`npm run test` includes real Lua-script integration tests when `redis-server` and `redis-cli` are available in PATH. Otherwise that suite is explicitly skipped; mocks cannot establish atomicity. To use binaries elsewhere:

```sh
REDIS_SERVER_BIN=/absolute/path/redis-server REDIS_CLI_BIN=/absolute/path/redis-cli npm run test
```

The suite starts an isolated Redis instance on a local Unix socket with persistence disabled, exercises parallel quota/concurrency admissions and expiry, and removes its temporary directory. No production database or AI provider is contacted.

To verify the API handler against the Upstash credentials in `.env.local`, explicitly opt in:

```sh
RUN_UPSTASH_INTEGRATION=true npm run test -- tests/admission.upstash.integration.test.ts
```

This suite reads local limiter settings, applies small per-scenario thresholds, and uses a unique Redis namespace for each test. It exercises burst/refill, daily quotas, parallel global admissions, IP/global active slots, provider-failure accounting, UTC reset, stale leases, invalid input and fail-closed storage errors. Only AI analysis is mocked, so no AI credits are spent. Exact test-owned keys are deleted afterward; application counters are untouched. It makes real Redis requests and requires network access. Ordinary tests skip this remote suite.

### Vercel WAF setup and rollout

1. In the project Firewall, add a rate-limit rule matching method `POST` and path `/api/feedback/analyze`, counted by IP: fixed window 60 seconds, limit 120, action 429. Publish the reviewed rule. WAF counts requests, including invalid requests; application admission counts potential paid attempts.
2. Verify rule coverage across every public alias and actual client-IP headers through direct Vercel ingress. Confirm preview storage is isolated and shared production counters survive a deployment.
3. Test an ordinary 100-row batch, short cooldowns, IP/global daily blocks, storage failure and the disable switch in preview. Use provider stubs for load tests.
4. Configure the deliberate production quota and inspect deny decisions, admission latency and provider failures after a small live batch.

WAF counters are regional and fixed windows permit boundary bursts. Redis admission handles shared quotas and smoother pacing. WAF rules are deployment configuration and are not automatically provisioned by this repository. Hosting, Redis and logging still incur usage even when AI is blocked. [Vercel WAF documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)

## Adding standard components

```sh
npx shadcn@4.21.1 add dialog
```

Add components only when needed. Review generated source and dependency changes; preserve keyboard behavior and accessible names. Customize theme variables in `src/app/globals.css`.

## Vercel deployment

1. Create a remote Git repository and push `main`.
2. Import the repository into Vercel using the Next.js preset and repository root.
3. Use Node.js 24.x, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.
4. Add `TYPESAFE_API_KEY` and all required protection settings separately to preview and production. Set an explicit global daily quota and the correct environment namespace, then configure and verify the WAF rule described above.
5. Deploy and verify the homepage. Set `main` as the production branch; use branch previews for review.

This baseline does not create a remote repository or a live Vercel project. No custom Vercel configuration file is required.

## Dependency audit note

At setup (2026-10-03), npm reports nine high-severity development-tooling findings through the Next.js ESLint configuration and shadcn CLI, ultimately reaching `fast-glob` → `micromatch` → `braces`. The registry has no patched `braces` release; `npm audit fix` does not resolve these findings, and the suggested forced fix downgrades the tooling to different major versions. Retain compatible tooling and reassess on upgrades. These findings concern development tooling; check production dependencies with `npm audit --omit=dev`.
