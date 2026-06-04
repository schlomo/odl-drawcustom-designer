# ADR-006: UI framework — React for shell

## Status

Accepted (locked in Phase 0)

## Context

The designer needs a multi-panel editor (canvas, properties, YAML, Content Manager, State Simulator). AI-assisted development favors ecosystems with the most training data and library compatibility.

## Decision

Use **React 19 + Vite + TypeScript** for the UI shell only.

Core modules (`src/core/`) remain **framework-agnostic pure TypeScript** with zero React imports. UI components are thin adapters calling core APIs.

State management (Phase 2+): Zustand + immer for project, selection, history, UI prefs.

## Consequences

- Best codegen reliability for complex property panels and forms
- CodeMirror, Testing Library, dnd-kit patterns available
- Bundle size (~45 KB gzip React) acceptable for desktop designer use case
- Phase 0 half-day sanity check validates React shell + one property form

## Alternatives considered

- **Preact** — rejected; React-only API friction for minimal savings
- **Vanilla TS** — rejected; high bug rate for panel-heavy UI at AI velocity
- **Svelte** — rejected; less training data for agent workflows
