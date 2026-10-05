# 0002: Deploy to Vercel

- Status: Superseded
- Date: 2026-10-03
- Supersedes: None
- Superseded by: [0008](0008-vercel-cicd.md)

## Context

The requested hosting target is Vercel. Feedback Radar starts as a standard Next.js application without additional infrastructure.

## Decision

Use Vercel's native Next.js deployment support with the repository root as the application root, Node.js 24.x, npm lockfile installation, and `npm run build`. Keep framework defaults; no custom deployment adapter or `vercel.json` is needed for this baseline.

After a remote Git repository is created and connected to Vercel, use preview deployments for branches and `main` for production. Provision environment variables separately for preview and production when a feature needs them.

This setup prepares the application for deployment but does not create a remote repository, connect a Vercel project, or publish a deployment.

## Alternatives considered

Self-hosted Node.js and alternative platforms add hosting and deployment choices outside the requested stack.

## Consequences

Vercel serves the application and hosts future server-side execution. Secrets are configured in Vercel environment settings, never committed or exposed through `NEXT_PUBLIC_*`. Future jobs must account for platform execution limits. Hosting cost and platform coupling must be considered as usage grows. No storage service is provisioned.

## Revisit when

Execution limits, background processing, cost, data residency, or portability requirements no longer fit Vercel.

## References

- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Environment variables](https://vercel.com/docs/environment-variables)
