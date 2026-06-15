# ADR-011: Behavior-test policy

## Status

Accepted

## Context

The test suite includes UI and editor coverage. Some tests assert internal helpers (`shouldShowX`, one-line wrappers, fixture smoke duplicated by sweeps). Brittle implementation tests increase refactor cost without protecting user-visible behavior.

ADR-008 established TDD and CI gates but did not distinguish **behavior** coverage from **implementation mirror** tests.

## Decision

Tests assert **observable outcomes** at layer boundaries:

| Layer | Assert | Do not assert |
|-------|--------|----------------|
| **Core** (`tests/core/`) | Spec-visible: parsed/serialized YAML equality, Zod validation messages, render primitives/coords/colors, template evaluation strings, HA-clean export (no designer fields) | Private helper return shapes unless they encode spec rules; duplicate render smoke when `render-element.test.ts` sweep passes |
| **UI** (`tests/ui/`) | User-visible wiring: canvas drag/resize changes element coords, YAML↔canvas selection stability, editor lint/completion on first list item, keyboard focus guards | Boolean mirrors of one-line functions; existence of exports; duplicate golden round-trip already in core |
| **Storage** (`tests/storage/`) | Persist/load round-trip for assets and mocks | Dexie schema internals beyond public adapter API |
| **Integration** | End-to-end editor mount (CodeMirror + lint + completion) where unit tests cannot cover DOM/tooltip behavior | Every CodeMirror extension flag in isolation |

**Fixture policy:** Golden YAML under `tests/fixtures/spec/` derived from `docs/spec/supported_types.md` (HA drawcustom). Parity with [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html) tracked in `docs/spec/odl-gap-report.md` (ADR-012). One sweep (`yaml-roundtrip.test.ts`, `render-element.test.ts`) covers all minimal fixtures; per-type tests add **only** behavior not covered by the sweep (e.g. percentage coords, visibility, dither).

**Deletion rule:** Removing a test is allowed when an equal or stronger behavior assertion exists elsewhere. Test count may decrease; spec/user-visible coverage must not.

**Anti-patterns (delete or merge):**

- `expect(fn()).toBe(true)` on a one-line `should*` wrapper with no branching
- Per-type "renders fixture without error" when sweep already covers it
- Asserting `toBeDefined()` on imports or trivial getters
- Duplicate HA-clean strip tests — keep one in `yaml-roundtrip.test.ts` plus schema validation case

## Consequences

- Contributors read `docs/testing.md` before large storage or undo/redo changes
- Spec reviewer checklist (`.cursor/agents/spec-reviewer.md`) aligns with behavior outcomes
- CI unchanged: `npm test` must pass; fewer tests is not a regression if behavior coverage holds

## Alternatives considered

- **Extend ADR-008 only** — rejected; ADR-008 stays focused on workflow/CI; behavior policy deserves a dedicated ADR for discoverability
- **100% coverage targets** — rejected; encourages implementation mirrors
- **Playwright-only UI tests** — deferred post-v1; Vitest behavior tests suffice for canvas geometry and editor wiring

## References

- ADR-008 (TDD and CI gates)
- `docs/testing.md`
