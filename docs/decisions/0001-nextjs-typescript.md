# 0001: Next.js App Router with TypeScript

- Status: Accepted
- Date: 2026-10-03
- Supersedes: None
- Superseded by: None

## Context

Feedback Radar needs an initial web application foundation. The chosen framework is Next.js, with Vercel as the deployment target. Product workflows, authentication, and persistence have not been designed yet.

## Decision

Use Next.js App Router, React, strict TypeScript, and npm with a committed lockfile. Target Node.js 24 LTS for local development and Vercel. Use `src/app` for routes and layouts, `src/components` for reusable UI, and `src/lib` for shared utilities and server integrations. The `@/*` alias resolves to `src/*`.

Prefer Server Components for initial rendering. Introduce Client Components where browser state or interaction requires them. Future business rules belong in server/application modules rather than presentation components; server entry points must validate untrusted input before invoking them.

The initial flow is browser request → Next.js server-rendered homepage → HTML and styles. The homepage has no mutable state, persistence, or AI requests.

Use Next.js ESLint rules and separate lint, typecheck, and production build commands. Scope Turbopack to this repository so unrelated parent lockfiles cannot change the application root. Preserve the existing project instructions in `AGENTS.md`.

## Alternatives considered

- A client-only React application would require separate choices for server APIs and deployment; the requested Next.js stack provides both boundaries.
- JavaScript without TypeScript would provide fewer checks for SDK and component interfaces.
- Other package managers remain possible; npm avoids adding a separate tool to the initial setup.

## Consequences

One application owns rendering and future server workflows. Server/client boundaries must remain explicit. No database, authentication system, custom server, or experimental React compiler is introduced. npm installs must use the lockfile for reproducibility. System fonts avoid network-dependent font downloads during builds.

## Revisit when

Independent services, long-running jobs, a different hosting model, or package-management requirements make the single-application structure unsuitable.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Deployment decision](0002-vercel-deployment.md)
