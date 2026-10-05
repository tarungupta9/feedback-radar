# 0008: CI-gated Vercel Git deployments

- Status: Accepted
- Date: 2026-10-05
- Supersedes: [0002](0002-vercel-deployment.md)

## Context

The first deployment needs a private remote repository, repeatable quality checks, branch previews, and production releases that wait for verification. The user approved GitHub Actions for CI and Vercel's native Git integration for deployment, with AI disabled for the initial rollout.

## Decision

Use the private `tarungupta9/feedback-radar` GitHub repository. Run the uniquely named `Feedback Radar quality` job on pushes and pull requests, with manual reruns available. Pin GitHub Actions to immutable revisions. Use Node.js 24 from `.nvmrc`, `npm ci`, real isolated Redis admission tests, lint, formatting, typecheck, and the production build. Explicitly install and check Redis binaries so their integration suite cannot silently skip in CI. Never pass AI or production Redis credentials to CI; the remote Upstash suite remains opt-in.

Connect the repository to the `feedback-radar` Vercel project. Keep the repository root, Next.js preset, Node.js 24.x, `npm ci`, `npm run build`, and framework output defaults. Branch pushes create previews; `main` is production. Require the GitHub `Feedback Radar quality` check through Vercel Deployment Checks before assigning production aliases. Configure the check before the first production deployment. A failed, cancelled, missing, or timed-out required check must not release a deployment. Do not force-promote around failures.

Set `ANALYSIS_ENABLED=false` in preview and production for the first rollout. Leave provider and Redis credentials local until the separate AI rollout configures environment-specific credentials, stable namespaces and secrets, deliberate daily quotas, the WAF rule, and live ingress verification. Uploads and the guide remain available. Analysis is rejected without provider calls.

## Alternatives and consequences

GitHub Actions could build with the Vercel CLI and deploy prebuilt artifacts. Native Git deployments retain Vercel's preview URLs, deployment status integration, and managed builds without a long-lived Vercel deployment token in GitHub. CI and Vercel each build the application; this duplicates build work but keeps CI secrets separate from runtime credentials.

GitHub Actions and the Vercel Git integration become deployment control boundaries. Application runtime, browser-only feedback/results, TypeSafe integration, Redis admission, and accessibility behavior remain unchanged. No new runtime dependency or datastore is introduced. Renaming the quality job requires updating the Vercel check. Vercel settings are external state and must be checked when recreating the project.

Rollback uses Vercel's previous production deployment. Environment variables and firewall configuration need separate review; rollback does not restore external state. Keep the disable switch in place during the initial rollout.

## Verification and revisit conditions

Verify a clean GitHub Actions run, production alias assignment only after the required check succeeds, branch preview deployment, homepage, guide, sample download, and API rejection with AI disabled. Check logs for deployment/runtime errors. No paid AI smoke test occurs during the disabled rollout.

Revisit when duplicated builds become costly, artifact identity between CI and deployment is required, multiple apps share the repository, or release approvals and staged rollout become necessary.

## References

- [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)
- [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
