# 0004: TypeSafe AI SDK on the server

- Status: Accepted
- Date: 2026-10-03
- Supersedes: None
- Superseded by: None

## Context

Feedback Radar will use `@typesafe-ai/sdk` for typed AI requests. The initial setup needs the dependency and a safe integration point; actual AI workflows have not been defined.

## Decision

Install the official SDK and expose `getTypeSafeClient(): TypeSafeClient` from `src/lib/typesafe.ts`. Mark this module `server-only` so client imports fail at build time. Construct the client lazily after checking the server-side `TYPESAFE_API_KEY` environment variable. Reuse the client within a server process; never create it at module import or during the static homepage build.

The initial homepage does not invoke the SDK. When an AI workflow is added, the intended flow is validated server input → application business rules → TypeSafe client → TypeSafe API → typed result → application response. SDK types describe AI results; application code owns interpretation, thresholds, and side effects.

Missing or blank credentials throw a clear server configuration error at first use. Future route handlers must translate SDK/network failures into appropriate user-facing responses and avoid leaking credentials or sensitive request data.

## Alternatives considered

- Direct HTTP integration would duplicate the SDK's request and type handling.
- Browser-side SDK use would expose credentials and move request control outside the server boundary.
- Implementing a demo AI endpoint now would introduce undefined workflows and unnecessary external calls.

## Consequences

The SDK and `server-only` guard are new dependencies. Future requests cross a trust boundary to TypeSafe's external API and may incur latency and usage costs. Only necessary, validated data should cross that boundary. Authentication, authorization, input limits, retention requirements, and error handling must be designed before exposing an AI endpoint.

Commit only a blank variable in `.env.example`; use `.env.local` locally and server-side environment settings on Vercel. Builds and the starter page work without credentials. No provider request, data storage, or AI UI is introduced by this setup.

## Revisit when

Provider capability, reliability, cost, privacy requirements, or multiple-provider support require changing the integration.

## References

- [Official TypeSafe JavaScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js)
- [SDK documentation](https://docs.typesafe.ai/sdk/javascript)
- [Next.js server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)
