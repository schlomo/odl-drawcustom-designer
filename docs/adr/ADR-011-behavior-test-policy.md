# ADR-011: Behavior-test policy

## Status

Accepted (revised 2026-07-15 — see [2026-07-15 revision](#2026-07-15-revision-playwright-for-real-browser-wiring) below; the original "Playwright-only UI tests — deferred post-v1" alternative is **superseded**)

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
| **E2E** (`tests/e2e/`, Playwright — see 2026-07-15 revision) | Real three-panel wiring: canvas click → property panel/element list selection, YAML click → selection, property edit → canvas, YAML edit → canvas — flows that need real pointer coordinates, real `EditorView` layout, or real debounce timing | Logic Vitest/jsdom already covers (mapping, validation, geometry math); do not re-prove a `tests/core/` or `tests/ui/` assertion in Playwright |

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

## 2026-07-15 revision: Playwright for real browser wiring

**Context:** this ADR originally deferred Playwright post-v1, on the theory that Vitest/jsdom behavior tests were sufficient for canvas geometry and editor wiring (see superseded alternative below). Two confirmed selection-sync bugs (#14, #15) shipped despite full `tests/ui/` coverage passing:

- #14 — `handleCursorPosition` (`src/ui/components/YamlPanel.tsx`) resolves cursor→element index synchronously against the *live* CodeMirror doc, while the committed `elements` array updates only via an 80ms-debounced, atomically-failing whole-document schema parse. jsdom has no real debounce/timer-vs-render race — a unit test can only assert each side of the race in isolation, not the race itself.
- #15 — the canvas→YAML scroll-on-select depends on real `EditorView` layout (`EditorView.scrollIntoView`, line/position mapping) that jsdom does not lay out or paint; a jsdom-based test cannot observe whether a real scroll happened.

Both bugs are **structurally uncatchable** by `tests/ui/` (jsdom): they require real pointer events landing at real pixel coordinates, real debounce timers racing real React renders, and a real laid-out `EditorView` to scroll. That is exactly the class of bug this ADR's Vitest-only stance assumed away.

**Decision (maintainer, 2026-07-15):** adopt a **two-layer** test strategy:

- **Vitest stays the home for all logic and mapping tests** — cheap, exhaustive, unchanged. Anything expressible without a real browser (parsing, validation, geometry math, cursor→index mapping functions in isolation) belongs here, not in Playwright.
- **Playwright is added, scoped strictly to real browser wiring** — the small set of flows where CodeMirror, React, and the canvas must be observed integrated in an actual browser: canvas click → property panel/element list selection, YAML click → selection, property edit → canvas update, YAML edit → canvas update. Chromium only, `tests/e2e/`, targeting 1–3 minutes of CI time. Regression specs for #14/#15 ship as `test.fixme` pending `fix/selection-sync-mapping`.

**The anti-pattern this ADR already named stands and is reinforced, not reversed:** "Playwright for logic covered by Vitest" (`docs/testing.md`) is still wrong — e2e tests must assert real-browser wiring outcomes (selection state, rendered row text, canvas hit-test position), never re-prove something a `tests/core/`/`tests/ui/` test already covers. The revision narrows *where* Playwright is deferred *from* (all UI wiring) to *where it is still deferred* (pure logic) — it does not open the door to e2e-for-everything.

## Alternatives considered

- **Extend ADR-008 only** — rejected; ADR-008 stays focused on workflow/CI; behavior policy deserves a dedicated ADR for discoverability
- **100% coverage targets** — rejected; encourages implementation mirrors
- **Playwright-only UI tests** — ~~deferred post-v1; Vitest behavior tests suffice for canvas geometry and editor wiring~~ **superseded 2026-07-15**: Vitest/jsdom cannot exercise real pointer coordinates, real debounce timing, or real `EditorView` layout — see the revision above. A small, scoped Playwright smoke suite now covers exactly that gap.

## References

- ADR-008 (TDD and CI gates)
- `docs/testing.md`
- Issues #14, #15 (confirmed selection-sync bugs motivating the 2026-07-15 revision), #18 (Playwright harness), #19 (CI split)
