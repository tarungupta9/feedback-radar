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

Analysis has server-side rate, daily quota and concurrency protection. Anonymous access remains supported; shared-network users share an IP allowance and clients can rotate addresses. Bot verification and anonymous-session limits are deferred. Same-origin checking and browser concurrency are supplementary controls. Enabling hosted analysis requires Redis configuration, reviewed quotas and the WAF rule below. The initial hosted rollout keeps analysis disabled.

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

The private [GitHub repository](https://github.com/tarungupta9/feedback-radar) connects to the `feedback-radar` project in Vercel's **Tarun Gupta's projects** team. Vercel builds branch previews and production from `main`. Project settings use the Next.js preset, repository root, Node.js 24.x, install command `npm ci`, build command `npm run build`, and framework output defaults. No custom deployment adapter or `vercel.json` is required.

`.github/workflows/ci.yml` runs the **Feedback Radar quality** job on every push and pull request, with manual runs supported. It installs Node 24 and dependencies from the lockfile, installs/checks Redis binaries, runs tests (including real isolated Redis admission), lint, formatting, typecheck, and the production build. CI uses no provider or production Redis secrets; the remote Upstash suite remains opt-in. Actions are pinned to immutable revisions.

The matching Vercel Deployment Check blocks production alias assignment until **Feedback Radar quality** succeeds for the deployed commit. Keep its name synchronized with the workflow job name. Failed/cancelled checks or missing results hold the release; inspect GitHub Actions and Vercel deployment details and fix the cause. Do not force-promote a failed check. Previews remain available for review before merging. Vercel rebuilds independently from CI; this retains the native Git integration without a Vercel deployment token in GitHub.

Preview and production initially set `ANALYSIS_ENABLED=false` and `RATE_LIMIT_LOCAL_IDENTITY=false`. Provider and Redis credentials are intentionally absent. Uploads, sample data, and `/guide` work; valid analysis requests return 503 before provider execution. The current route checks provider credentials before the disable switch, so an unconfigured deployment reports the missing AI configuration. No paid analysis smoke test is performed during this rollout.

### Recreating the deployment setup

1. Connect the private repository to a Vercel project with the settings above and production branch `main`.
2. Set the two disable settings in preview and production before deploying. Never upload `.env.local` or import development credentials automatically.
3. In Vercel Project Settings → Deployment Checks, add the GitHub **Feedback Radar quality** check for production, blocking alias assignment. Configure it before the first production deployment. Use a 15-minute timeout.
4. Push/merge code, confirm GitHub CI succeeds, then verify Vercel build and production promotion. Check `/`, `/guide`, `/sample-feedback.csv`, API rejection, and runtime errors. Preview URLs retain the team's deployment protection.
5. To enable analysis later, configure server-only provider/Redis credentials, stable per-environment secrets/namespaces, deliberate daily quotas, the WAF rule above, and verify direct Vercel ingress in preview. Redeploy after changing environment variables; keep production disabled until the rollout checks pass.

### Rollback

Use the Vercel project's Deployments page to roll back to a previously verified production deployment. The first deployment has no earlier production version. Investigate failed CI/builds before retrying; force promotion bypasses the release gate. Rollback does not restore environment variables, firewall settings, or external Redis state. See [deployment checks](https://vercel.com/docs/deployment-checks), [instant rollback](https://vercel.com/docs/instant-rollback), and [the deployment decision](docs/decisions/0008-vercel-cicd.md).

## Dependency audit note

At setup (2026-10-03), npm reports nine high-severity development-tooling findings through the Next.js ESLint configuration and shadcn CLI, ultimately reaching `fast-glob` → `micromatch` → `braces`. The registry has no patched `braces` release; `npm audit fix` does not resolve these findings, and the suggested forced fix downgrades the tooling to different major versions. Retain compatible tooling and reassess on upgrades. These findings concern development tooling; check production dependencies with `npm audit --omit=dev`.
