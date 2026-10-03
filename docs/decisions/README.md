# Architecture decisions

Record significant technology and architecture choices here as numbered architecture decision records (ADRs). These decisions describe the current baseline, not permanent commitments.

| Record | Decision | Status |
| --- | --- | --- |
| [0001](0001-nextjs-typescript.md) | Next.js App Router with TypeScript | Accepted |
| [0002](0002-vercel-deployment.md) | Deploy to Vercel | Accepted |
| [0003](0003-tailwind-shadcn.md) | Tailwind CSS and shadcn/ui | Accepted |
| [0004](0004-typesafe-ai.md) | TypeSafe AI SDK on the server | Accepted |

## Evolving decisions

Add the next sequential record using [the template](template.md). Explain context, alternatives, consequences, and conditions for revisiting the decision. Review material architecture changes before implementation, as required by `AGENTS.md`.

Statuses: Proposed, Accepted, Deprecated, Superseded. When changing an accepted decision, add a replacement record, mark the old record Superseded, and link both records. Preserve the original rationale; update this index to reflect the new status.

Package versions belong in `package.json` and `package-lock.json`; ordinary version upgrades do not require a new ADR unless they change architectural behavior.
