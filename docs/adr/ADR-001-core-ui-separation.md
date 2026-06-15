# ADR-001: Core/UI separation

## Status

Accepted

## Context

The drawcustom designer must be testable, portable, and maintainable. Rendering, YAML parsing, template evaluation, and asset resolution are complex and correctness-critical. UI panels and canvas chrome change frequently and benefit from a component framework.

## Decision

Split the codebase into:

- `src/core/` — pure TypeScript modules with **no React imports**
- `src/ui/` — React 19 shell that calls core via typed functions
- `src/storage/` — persistence adapters (IndexedDB, localStorage)

The renderer, YAML engine, template evaluator, and color/dither pipeline live in core.

## Consequences

- Core logic is unit-tested with Vitest (golden fixtures, no DOM)
- ESLint enforces the import boundary on `src/core/**`
- UI components stay thin adapters; business logic does not leak into JSX

## Alternatives considered

- **Monolithic React app** — rejected; hard to TDD rendering and YAML
- **Vanilla TS for entire app** — rejected; slower UI iteration for AI-assisted development
