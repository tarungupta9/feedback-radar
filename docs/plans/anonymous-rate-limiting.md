# Anonymous rate limiting: implementation plan

Status: Architecture approved by the user; implemented in the application. Redis provisioning, WAF publication and live rollout remain deployment steps.
Date: 2026-10-05

## Scope and constraints

Implement rate limiting and quotas first, as selected by the user. Protect the paid `POST /api/feedback/analyze` flow while preserving anonymous access, 100-row uploads, three browser workers, partial results and retries of unsuccessful rows.

Deliver explicit cooldown and quota messages. The browser must stop dispatching work when blocked instead of failing the remainder of a batch one row at a time.

Assume direct Vercel hosting with Node.js 24 and one authoritative Redis database for production admission decisions. Actual deployment topology must be verified before trusting client IP headers.

Non-goals: authentication, BotID, Turnstile, anonymous-session cookies, saved feedback, background jobs, result caching, cross-request AI deduplication and an admin dashboard. Bot verification and session quotas remain follow-up work. Rate limiting reduces abuse; anonymous clients can rotate addresses and exhaust the shared allowance.

## High-level design and reasoning

The request flow is:

1. Vercel WAF applies a coarse IP request limit before application execution.
2. The existing Next.js route checks origin, media type, body size and feedback schema.
3. Server-only code resolves a trusted network identity and checks protection configuration.
4. One Redis admission operation checks all application limits and reserves allowance plus active-call slots.
5. Only confirmed admission permits a TypeSafe AI request.
6. The server releases its active-call slots after settlement. Daily allowance remains consumed.
7. The browser displays success, waits for temporary limits, or pauses the batch.

The edge and application layers own different rules. WAF counts requests, including invalid requests, and reduces load on the application and Redis. Application admission counts validated attempts that may spend AI credits and enforces quotas shared across app instances.

### Edge protection

Target `POST /api/feedback/analyze`; start at 120 requests per 60 seconds per IP with a fixed-window rule. This is a starting value, not a measured capacity recommendation. A fast legitimate batch can send 100 requests; a generic 10-requests/minute rule would frustrate that workflow.

Vercel WAF counters are regional. They are unsuitable as the sole global quota. Fixed windows also permit bursts around their boundaries; application-level smoothing handles that separately.

Edge denials may have non-JSON bodies or lack useful retry headers. The client must handle those responses safely.

### Application policy

Proposed initial settings:

| Control                  | Proposed setting                  | Purpose                                                             |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------- |
| IP burst allowance       | 20 admissions                     | Allow short bursts without unlimited sustained traffic              |
| IP refill rate           | 2 admissions/second               | Sustain approximately 120 admissions/minute after the initial burst |
| IP daily allowance       | 500 admissions per UTC day        | Bound sustained usage from one network                              |
| IP active-call limit     | 6 leases                          | Allow two ordinary three-worker batches on a shared network         |
| Global active-call limit | 20 leases                         | Bound simultaneous provider work across all clients                 |
| Global daily allowance   | Explicit production configuration | Bound total admitted AI attempts across rotating IPs                |

Global daily allowance has no permissive production fallback. A value of 1,000 can be used as a planning example, but must be chosen from budget and provider pricing before launch.

Rate, quota and concurrency answer different questions:

- Rate: how quickly may this network start work?
- Quota: how much work may it start during a day?
- Concurrency: how many calls may remain active at once?

The token bucket stores available tokens and its refill timestamp. Each admitted row consumes one token; tokens refill up to the capacity of 20. This smooths bursts across minute boundaries. It is not an exact rolling 120-request/minute rule.

Daily quotas use fixed UTC calendar days. Reset is midnight UTC, displayed in the user's local time. This is deliberately simpler than rolling 24-hour quotas; usage can reach twice a daily allowance across a midnight boundary. The allowance is per IP/network, never described as per person.

### Shared state and atomic admission

Use `@upstash/redis` with a small, versioned Lua admission script. A single operation checks the bucket, IP/global daily counters and IP/global active-call leases before committing an admission. Daily counters and leases are not independently checked and incremented from TypeScript.

Example race: one global slot remains and two Vercel instances receive requests. Separate reads can both see the slot and both proceed. Atomic check-and-reserve admits only one under normal Redis execution.

The script is application business logic, stored and reviewed with the application. Keep it short, bounded and validate configuration before execution. Atomic execution prevents interleaving; it does not provide rollback after a script error. Verify arguments and Redis key types before mutating admission state.

Use one production database and a shared production namespace across deployments. Do not key the global cap by deployment ID. Prefer a separate preview database; at minimum isolate preview keys and provider credentials. No independently synchronized regional counters for global admission.

Daily quota is consumed immediately before a provider call. Invalid input, missing AI configuration and rejected admission do not consume daily AI allowance. Provider errors, timeouts and client disconnects after admission retain that allowance because work may have been billed. This intentionally overcounts some failed attempts rather than allowing refunds to reopen spending capacity.

An admission receives a unique lease ID. Release removes only that lease and is idempotent. Expired leases are pruned during subsequent admissions. Start with a 45-second lease, exceeding the current 30-second function limit; revisit if provider/function limits change. Leases bound admitted in-flight requests, not necessarily work continuing inside a provider after cancellation.

Do not blindly replay an admission write after an ambiguous network timeout. Stop without calling AI if admission cannot be confirmed; leave any reservation to expire. Configure bounded Redis requests and disable automatic admission-write retries unless the operation becomes explicitly idempotent.

### Trust, privacy and failure behavior

Read the platform-established IP header only when running behind the reviewed Vercel ingress. Validate and canonicalize IPv4/IPv6 representations, including IPv4-mapped addresses. Never accept a browser-provided identity field or guess an IP from arbitrary forwarded-header chains.

Create Redis identity keys using HMAC-SHA256 with a server-only secret. Plain hashing of IPs is easy to enumerate. HMAC reduces raw-IP exposure but the identifier remains pseudonymous data. Initial limits use full canonical addresses; IPv6 address rotation and proxy rotation remain known bypasses, bounded by the global quota. IPv6 subnet aggregation can be evaluated later for its shared-network tradeoff.

Store only counters, timestamps and random lease IDs. Set expiry for all limiter keys; daily counters expire shortly after their day ends, short-term keys after inactivity, and lease data after lease expiry. Do not copy feedback, ratings, filenames or results into Redis. Operational logs contain decisions, timing and request IDs, not feedback or raw IPs.

Redis unavailable, invalid configuration or missing trusted production identity: return a sanitized 503 and make no AI call. This trades temporary analysis availability for cost control. Upload parsing and existing results remain usable. A server-side analysis-disable setting also returns 503.

The global admission quota is an operational control, not a guaranteed monetary billing ceiling. Variable per-call costs, retained provider work, counter loss and datastore failure/failover semantics matter. Verify Upstash's consistency and recovery guarantees for the chosen topology. Add provider-enforced spending/credit restrictions if supported; do not promise an exact currency cap from request counts alone.

## Low-level design

### Modules and ownership

| Path                                                             | Responsibility                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/abuse/config.ts`                                        | Validate server settings, policy values, environment and namespace                  |
| `src/lib/abuse/identity.ts`                                      | Resolve trusted IP, canonicalize it and produce HMAC identity                       |
| `src/lib/abuse/redis.ts`                                         | Lazy server-only Upstash client; bounded requests; no unsafe write retries          |
| `src/lib/abuse/admission.ts`                                     | Typed admission/release interface, Lua operations and result validation             |
| `src/lib/feedback/api-errors.ts`                                 | Shared public error contract without importing server dependencies                  |
| `src/app/api/feedback/analyze/route.ts`                          | Validation, admission before AI, error mapping and lease cleanup                    |
| `src/lib/feedback/client.ts`                                     | Shared dispatch gate, cooldown scheduling, safe response parsing and runner outcome |
| `src/components/feedback/feedback-provider.tsx`                  | Persist batch pause/block state and coordinate resume                               |
| `src/components/feedback/processing-status.tsx`                  | Accessible cooldown and pause controls                                              |
| `src/components/feedback/feedback-results.tsx`                   | Partial results, remaining-row resume and quota messages                            |
| `src/components/feedback/feedback-workspace.tsx`                 | Render paused/blocked results without losing current upload                         |
| `src/components/feedback/feedback-table.tsx`                     | Make remaining rows distinct from genuine row failures; honor resume restrictions   |
| `tests/`                                                         | Admission integration, route, queue and rendered-workflow tests                     |
| `.env.example`, `package.json`, `package-lock.json`, `README.md` | Configuration, dependency, check scripts and operational setup                      |
| `docs/decisions/0007-anonymous-rate-limiting.md`                 | Record approved architecture and revisit conditions                                 |

Non-UI modules retain `.ts`; React modules use `.tsx`, strict TypeScript and existing shadcn components.

Proposed internal contract:

```ts
type AdmissionResult =
  | { allowed: true; leaseId: string }
  | {
      allowed: false;
      reason: "rate" | "ip_quota" | "global_quota" | "capacity";
      retryAfterSeconds: number;
      resumeAt: string;
    };
```

Server-only functions: `admitAnalysis(identity, requestId)` and `releaseAnalysis(identity, leaseId)`. Validate Redis results at runtime. Clean up leases in `finally` without replacing a successful AI response when cleanup fails; expiry is the fallback.

Public errors expose a stable code, readable message, retryability and optional resume timestamp. Rate/capacity and IP quota denials return 429; exhausted global allowance returns 503 with a daily-cap code. Storage errors/disabled analysis return 503 with separate codes. Existing provider 429 responses receive a provider-specific code, avoiding confusion with pre-AI rejection. All responses retain `Cache-Control: no-store`; known cooldowns include `Retry-After`.

### Browser state and accessibility

Batch control transitions: `running -> coolingDown -> running`; after repeated short-term denials, `paused`; daily quota or protection failure moves to `blocked`. User pause stops new dispatch and leads to `paused` after settling active work.

All three workers share one cooldown and dispatch gate. A denied row remains pending. Workers do not dispatch more rows after a block, but already-admitted requests may finish and update results. Drain active work before finalizing the runner outcome.

For application rate/capacity denials, wait according to `Retry-After` with small jitter. Limit automatic retries to three per row and automatic waits to 60 seconds; longer cooldowns pause for manual resume. For edge 429 responses, handle text/HTML, validate retry headers and fall back to a conservative 60-second cooldown. Existing provider failures retain manual row retry; no automatic repeat of potentially billable calls.

Daily blocks show the reset time and prevent auto-resume. Resume targets pending and failed rows, never successful ones. Cooldown announcements use a polite live region on transitions, not every second. Controls remain keyboard accessible; focus does not jump during cooldown. Distinguish incomplete processing from an entirely finished batch.

### Configuration and deployment

Add server-only Redis REST URL/token, identity HMAC secret, namespace, analysis-enabled flag and validated limit values. Production requires configuration; no silent protection bypass. A local-only explicit development adapter may support local testing, but cannot activate for public preview/production. Missing credentials must not prevent building or browsing the app.

No new runtime, deployment adapter or background service. Keep Next.js/Node.js and Vercel framework defaults. Place the authoritative Redis database near the function execution region. Document WAF configuration as a deployment step and verify coverage for every public alias.

### Verification and rollout

1. Unit-test configuration, IP normalization/HMAC, time boundaries, retry headers and typed error mapping.
2. Execute the real admission script against isolated Redis, including many parallel requests for the final allowance/slot. Mocked route tests alone cannot prove atomic admission.
3. Cover token refill, UTC reset, no daily debit on rejection, provider-failure accounting, bounded keys, double release, stale leases, ambiguous timeout and storage failure. Verify no AI calls on unconfirmed admission.
4. Test the shared queue with three workers, cooldown, non-JSON edge denials, daily stop, user pause, active-request draining and resume preserving completed results. Render and test quota/pause messages and accessible controls.
5. Run tests, lint, format check, typecheck and production build using RTK. Add the new plan/ADR to formatting coverage where appropriate.
6. In an isolated preview, verify actual Vercel IP handling, Redis script behavior, preview/production isolation and both edge and application denials. Use provider stubs for load tests.
7. Configure reviewed production limits and WAF rule, exercise a small live batch, inspect decisions/latency and verify the disable switch. Infrastructure provisioning and production deployment remain separate actions.

## Architecture delta and review points

Retain Next.js, React, strict TypeScript, Tailwind/shadcn, browser upload parsing, memory-only results, row-by-row TypeSafe analysis, provider validation and existing timeouts. No feedback persistence or change to the AI rubric.

Add one dependency (`@upstash/redis`), one external storage service (Upstash Redis), server-side admission logic and browser cooldown/pause behavior. New trust boundaries: Vercel-established network identity and the Redis admission response. No browser-to-Redis access. BotID and session state are deferred by the user's scope choice.

Review the shared-IP tradeoff, initial rates/concurrency, UTC daily reset, failure-closed policy and global allowance before implementation. Production allowance remains unresolved until budget/provider cost is known. If Redis guarantees or deployment topology require a different store or identity strategy, surface that material deviation before coding.

## Sources

- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting): regional counters, fixed windows and rule configuration.
- [Vercel request headers](https://vercel.com/docs/headers/request-headers): platform IP headers and proxy implications.
- [Upstash rate-limiting algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms): fixed/sliding windows and token buckets.
- [Redis Lua scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/): atomic execution and bounded server-side operations.
- [Upstash EVAL](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval): TypeScript script interface.
- [Upstash SDK request timeout](https://upstash.com/docs/redis/sdks/ts/advanced): bounded requests that throw on timeout.
- [Upstash rate-limit SDK features](https://upstash.com/docs/redis/sdks/ratelimit-ts/features): timeout behavior that can allow requests.
- [Upstash consistency](https://upstash.com/docs/redis/features/consistency): replication, consistency and failure-model limitations.
