# Testing guide

Canonical ADR: [ADR-011](adr/ADR-011-behavior-test-policy.md). CI gates: [ADR-008](adr/ADR-008-tdd-and-ci.md).

## Layer rules

| Directory | Runs in | Assert |
|-----------|---------|--------|
| `tests/core/` | Node (Vitest) | Spec-visible outcomes: YAML parse/serialize equality, validation, render primitives, template strings, HA-clean export |
| `tests/ui/` | Node or jsdom | User-visible wiring: canvas geometry, YAML↔canvas coupling, editor lint/completion, focus guards |
| `tests/storage/` | Node + fake IndexedDB | Asset/mock persist round-trip via public storage adapters |
| `tests/e2e/` | Real Chromium (Playwright) | Real three-panel wiring jsdom cannot exercise: canvas click ↔ property panel/element list selection, YAML click ↔ selection, property edit → canvas, YAML edit → canvas (ADR-011, revised 2026-07-15) |
| `tests/fixtures/` | (data) | Golden YAML from `docs/spec/supported_types.md` (HA drawcustom); reconcile with [ODL](https://opendisplay.org/protocol/open-display-language.html) per `docs/spec/odl-gap-report.md` |

**Core changes:** Red → Green → Refactor (`.cursor/rules/tdd-required.mdc`). Write or update `tests/core/` first.

**UI changes:** Test behavior the user sees (coords after drag, selection after layer move). Do not duplicate core golden tests in UI.

**E2E changes (`tests/e2e/`, Playwright):** only for wiring that requires a real browser — real pointer coordinates, real debounce timing, real `EditorView` layout (e.g. the #14/#15 selection-sync races, which jsdom structurally cannot reproduce). Keep the suite small (target 1–3 minutes); assert observable outcomes (selection state, a rendered row's text, canvas hit-test position), never markup internals. Do not add an e2e test for anything a `tests/core/` or `tests/ui/` test can already cover — see the anti-pattern below.

## Fixture layout

```
tests/fixtures/
  spec/           # One *-minimal.yaml per draw type (+ rich variants)
  elements/       # Focused element snippets
  templates/      # Template evaluation inputs
  assets/         # Binary/font samples for resolver tests
```

- Minimal fixtures must validate and round-trip (`tests/core/yaml-roundtrip.test.ts`).
- Render smoke for all spec fixtures: `tests/core/renderer/render-element.test.ts`.
- Per-type renderer tests add **only** behavior the sweep does not cover (percentage coords, visibility, dither, text metrics).

## What to test

**Core — always worth a test**

- New or changed Zod field → fixture + validate + round-trip
- Color alias / coordinate resolution edge case
- Template evaluation fixture from spec
- HA-clean: `serializeYamlPayload` never emits `DESIGNER_ONLY_FIELDS` or `_`-prefixed keys

**UI — worth a test**

- Canvas: `translateElement` / `applyBoundsResize` change stored coords (see `canvas-interaction.test.ts`)
- YAML linked mode: selection survives layer reorder (`yaml-elements-sync.test.ts`)
- Editor: first-list-item lint/completion (`yaml-editor-integration.test.ts`)
- Keyboard: canvas shortcuts suppressed when CodeMirror focused (`canvas-keyboard.test.ts`)

**Storage — worth a test**

- Put/get asset blob by YAML key
- Global mock map read/write (Dexie v3)

## Anti-patterns — do not add

| Anti-pattern | Why |
|--------------|-----|
| `expect(shouldShowX(...)).toBe(true)` on a one-liner | Mirrors implementation; delete or fold into integration test |
| `expect(markup).toContain('…')` as **only** proof of HA/visual parity | Proves attribute presence, not pixels or layout (see ADR-007 line/divider lesson) |
| "renders fixture without error" per type | Duplicates `render-element.test.ts` sweep |
| Assert export / function exists | TypeScript + imports already enforce |
| Snapshot of stub label strings | Brittle; assert structured primitive fields |
| Third copy of HA-clean strip logic | Keep `yaml-roundtrip.test.ts` + one validate case |
| Playwright for logic covered by Vitest | Still wrong after the 2026-07-15 revision — e2e (`tests/e2e/`) is scoped to real browser wiring only (pointer coords, debounce timing, `EditorView` layout), not a place to re-prove mapping/validation logic |

## Renderer HA parity tests (ADR-007)

When fixing **preview or PNG vs Home Assistant `imagegen`**:

1. State the **observable** requirement (e.g. divider row is black on yellow, text bottom at `anchorY`).
2. Write a test that fails on current code — prefer `tests/core/renderer/` for geometry/primitives; `tests/ui/` for export/finalize when DOM/canvas is required.
3. Implement the fix; re-run `npm test`.

**Good examples in repo:** `text-ink-bounds.test.ts`, `text-anchor.test.ts`, `tag-text-hard-edge.test.ts` (filter applied, not markup only).

**Not sufficient alone:** checking SVG/HTML for `shape-rendering`, class names, or internal helper return values.

## When NOT to add a test

- Pure re-export or type-only change
- Tailwind/layout tweak with no behavior change
- Refactor that preserves public API — existing behavior tests must still pass
- Duplicating spec sweep coverage for a new element type — extend fixtures + sweep instead

## Running tests

```bash
npm test              # all Vitest — the merge gate
npm run lint          # includes core React import ban
npm run build         # required before deploy (ADR-008)
npm run build && npm run test:e2e   # Playwright smoke suite (tests/e2e/); build first, it runs against `vite preview`
```

## CI test reports

The `checks` job (`.github/workflows/pages.yml`) surfaces results three ways:

- **Inline annotations** on the PR diff / Files tab — from vitest's `github-actions` reporter (`npm run test:ci`) and Playwright's `github` reporter. These work on fork PRs too.
- **Check-run reports** "Vitest" and "Playwright" in the PR's Checks tab — per-test tables published by `dorny/test-reporter` from the JUnit XML in `reports/` (same-repo PRs only; fork PRs skip these because their `GITHUB_TOKEN` cannot write check runs).
- **Playwright HTML report** — uploaded as a workflow artifact (`playwright-report-<run>`) on every run, 7-day retention; download and open `index.html` for traces and step-by-step detail.

`npm run test:ci` is `npm test` plus the annotation + JUnit reporters; local runs don't need it.

## Storage tests

Dexie schema upgrades wipe dev data on failure (ADR-003). Keep adapter-level behavior assertions, not internal version numbers.
