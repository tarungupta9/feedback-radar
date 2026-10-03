# 0003: Tailwind CSS and shadcn/ui

- Status: Accepted
- Date: 2026-10-03
- Supersedes: None
- Superseded by: None

## Context

Feedback Radar needs consistent styling and standard UI components. The requested choices are Tailwind CSS and shadcn/ui.

## Decision

Use Tailwind CSS v4 with its PostCSS integration. Define shared theme tokens as CSS variables in `src/app/globals.css`. Initialize shadcn/ui with TypeScript, React Server Component support, a neutral theme, and local component files under `src/components/ui`.

Pull standard components from the shadcn CLI instead of recreating them. Start with Button and Card, adding other components only when used. `components.json` records registry configuration and aliases. `src/lib/utils.ts` provides the shared `cn` class-merging utility.

Use the Radix-backed shadcn component variant. App-specific composition lives outside `components/ui`. Preserve semantic markup, keyboard interaction, focus indicators, and accessible naming when customizing components.

## Alternatives considered

- Handwritten component primitives would require maintaining standard interaction and accessibility behavior ourselves.
- A bundled component framework would offer less direct ownership of source and styling than shadcn's local-source approach.

## Consequences

Component source is versioned in this repository; upstream fixes must be reviewed and applied locally. Tailwind, class-merging utilities, variant utilities, and component primitive dependencies become part of the UI foundation. No runtime design service is introduced. Avoid importing unused components or entire component collections.

## Revisit when

Accessibility requirements, maintenance costs, or a broader design system require a different component strategy.

## References

- [Tailwind with Next.js](https://tailwindcss.com/docs/guides/nextjs)
- [shadcn/ui with Next.js](https://ui.shadcn.com/docs/installation/next)
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
