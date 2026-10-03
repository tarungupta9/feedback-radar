# Feedback Radar

Initial application foundation for understanding customer feedback. Feedback collection, analysis, authentication, and persistence are not implemented yet.

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

Open [localhost:3000](http://localhost:3000). The homepage works without an API key.

To prepare credentials for future AI features, copy `.env.example` to `.env.local` and set `TYPESAFE_API_KEY`. Never prefix this key with `NEXT_PUBLIC_` or commit the local file.

## Checks

```sh
npm run lint
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

Use `getTypeSafeClient()` only from server modules. It checks for a nonblank key at first use and reuses the client within a server process. No AI requests happen during homepage rendering or builds. Define validation, authorization, and user-facing error handling when introducing an AI workflow.

## Adding standard components

```sh
npx shadcn@4.21.1 add dialog
```

Add components only when needed. Review generated source and dependency changes; preserve keyboard behavior and accessible names. Customize theme variables in `src/app/globals.css`.

## Vercel deployment

1. Create a remote Git repository and push `main`.
2. Import the repository into Vercel using the Next.js preset and repository root.
3. Use Node.js 24.x, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.
4. When AI features need credentials, add `TYPESAFE_API_KEY` separately to the appropriate preview and production environments.
5. Deploy and verify the homepage. Set `main` as the production branch; use branch previews for review.

This baseline does not create a remote repository or a live Vercel project. No custom Vercel configuration file is required.

## Dependency audit note

At setup (2026-10-03), npm reports nine high-severity development-tooling findings through the Next.js ESLint configuration and shadcn CLI, ultimately reaching `fast-glob` → `micromatch` → `braces`. The registry has no patched `braces` release; `npm audit fix` does not resolve these findings, and the suggested forced fix downgrades the tooling to different major versions. Retain compatible tooling and reassess on upgrades. These findings concern development tooling; check production dependencies with `npm audit --omit=dev`.
