# 0007: Shared admission control for anonymous AI analysis

- Status: Accepted
- Date: 2026-10-05

## Context

Feedback Radar permits anonymous uploads and sends one paid TypeSafe request per feedback row. Browser concurrency and origin checks cannot prevent direct API abuse. The user approved rate limiting and quotas first, deferring BotID and anonymous sessions.

## Decision

Keep the row API, 100-row upload allowance, browser parsing/results and current AI rubric. Use Vercel WAF for coarse request filtering and one authoritative Upstash Redis database for application admission. Add `@upstash/redis` with bounded requests and automatic write retries disabled. A Lua script atomically checks and reserves token-bucket allowance, IP/global UTC-day counters and expiring IP/global active-call leases. All script keys share a namespace hash tag. Do not synchronize separate regional counters or reset namespaces on deployment.

Initial settings are burst 20, refill 2/second, 500 daily admissions/IP, 6 active calls/IP and 20 globally. Require an explicitly configured global daily quota. Every admitted attempt retains its daily debit, including provider failures; rejected/invalid requests do not debit daily quota. Release only the caller's random lease in `finally`, with 45-second expiry as crash/cleanup fallback. Redis server time determines pacing and UTC-day boundaries.

Resolve canonical network identity from the platform-established Vercel header at direct ingress and HMAC it with a stable server-only secret. An explicit development loopback identity is available outside Vercel and still uses Redis quotas. No public bypass. Fail closed with sanitized 503 responses on configuration, identity or storage failure. Store no feedback in Redis and expire every limiter key.

Extend the browser's shared worker gate with bounded cooldowns, user pause, blocked-batch messages and explicit resume. Preserve successful results, leave denied/unsubmitted rows pending, and drain existing requests before settling the batch. Automatic retries apply to pre-provider admission/edge denials; provider failures remain manual retries. Distinguish application and provider error codes. Use polite status announcements and keyboard-accessible controls.

## Alternatives and consequences

Process-memory counters lose state on restart and cannot coordinate Vercel instances. WAF alone uses regional counters and cannot enforce one application-wide daily allowance. Independent read/increment operations race. The rate-limit SDK's timeout behavior can allow traffic; paid analysis needs confirmed admission, so use a small reviewed script and fail-closed client instead.

Redis becomes a runtime dependency for paid analysis. Shared networks share limits; rotating addresses can bypass individual allowances. Global quotas bound admitted attempts during normal operation, not exact provider billing or all datastore recovery scenarios. Counter loss/failover, variable costs and provider work after cancellation remain limitations. Check provider-enforced spending controls and datastore guarantees before making stronger claims.

No new runtime, authentication, feedback persistence, background jobs, BotID or session cookies. Vercel remains the hosting target. WAF publication, Redis provisioning and production rollout require deployment configuration; implementation does not perform those operations.

## Verification and revisit conditions

Test real Redis script races, refill, UTC reset, rejection accounting, key expiry, double release and stale leases. Test route fail-closed behavior and client cooldown, HTML denials, pause, active-work draining and resume. Run tests, lint, formatting, typecheck and build. Verify live ingress and edge rules in preview before production.

Revisit when shared-IP fairness becomes unacceptable, IP rotation dominates traffic, deployment/proxy topology changes, provider/function duration changes, or strict financial guarantees are required. BotID and session quotas are the planned follow-up.

## References

- [Approved implementation plan](../plans/anonymous-rate-limiting.md)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Upstash consistency](https://upstash.com/docs/redis/features/consistency)
- [Redis Lua scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/)
