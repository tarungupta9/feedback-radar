# Feedback Radar

## Token Optimisation

Use caveman skill for token efficiency

## Code style

- Use React, strict typescript with usage of .tsx extension, Tailwind CSS
- Make use of shadcn components rather writing custom implementations
- Avoid putting inline styles to overwrite styling
- Generated code should be modular UI components and readable by human
- UI should adhere to accessibility (a11y) guidelines
- Prefix shell commands with `rtk`; use `rtk proxy <command>` when no wrapper
  exists.

## Plan with architecture visible

Every implementation plan which involves coding or technical implementation must give the user an architectural review point before code changes begin. Scale the detail to the change, but always include:

- **Scope and constraints:** the user-visible outcome, affected flows, assumptions, and explicit non-goals.
- **Build system design** affected system boundaries, components, ownership of data and business rules, end-to-end data flow, persistence or external-service changes, deployment impact, and major tradeoffs.
- **LLD (low-level design):** files and modules to change, types and interfaces, function or component responsibilities, state transitions, validation and error paths, accessibility behavior, and test/check coverage.
- **Architecture delta:** state which existing architectural decisions remain unchanged and call out every proposed new dependency, service, storage location, runtime integration, or trust boundary.

For a small local fix, the HLD and LLD can each be a few sentences. If there is no architectural impact, say so explicitly. For a material architectural change, present the HLD and LLD and wait for the user's review before implementing it. After approval, keep the implementation aligned with the reviewed design; surface any material deviation before proceeding.

## Verification

- Test user-visible behavior by writing unit-tests and meaningful edge cases.
- After application changes, run tests, lint, formatting checks and build.
- Report actual checks, failures, blockers and unverified behavior.