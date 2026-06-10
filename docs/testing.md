# Testing guide

Phase 3g policy for odl-drawcustom-designer. Canonical ADR: [ADR-011](adr/ADR-011-behavior-test-policy.md). CI gates: [ADR-008](adr/ADR-008-tdd-and-ci.md).

## Layer rules

| Directory | Runs in | Assert |
|-----------|---------|--------|
| `tests/core/` | Node (Vitest) | Spec-visible outcomes: YAML parse/serialize equality, validation, render primitives, template strings, HA-clean export |
| `tests/ui/` | Node or jsdom | User-visible wiring: canvas geometry, YAML↔canvas coupling, editor lint/completion, focus guards |
| `tests/storage/` | Node + fake IndexedDB | Asset/mock persist round-trip via public storage adapters |
| `tests/fixtures/` | (data) | Golden YAML from `docs/spec/supported_types.md` — not hand-waved inline strings when a fixture exists |

**Core changes:** Red → Green → Refactor (`.cursor/rules/tdd-required.mdc`). Write or update `tests/core/` first.

**UI changes:** Test behavior the user sees (coords after drag, selection after layer move). Do not duplicate core golden tests in UI.

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
- Mock map read/write for active project (until Phase 4a global mocks)

## Anti-patterns — do not add

| Anti-pattern | Why |
|--------------|-----|
| `expect(shouldShowX(...)).toBe(true)` on a one-liner | Mirrors implementation; delete or fold into integration test |
| "renders fixture without error" per type | Duplicates `render-element.test.ts` sweep |
| Assert export / function exists | TypeScript + imports already enforce |
| Snapshot of stub label strings | Brittle; assert structured primitive fields |
| Third copy of HA-clean strip logic | Keep `yaml-roundtrip.test.ts` + one validate case |
| Playwright for logic covered by Vitest | Defer E2E to Phase 4h smoke only |

## When NOT to add a test

- Pure re-export or type-only change
- Tailwind/layout tweak with no behavior change
- Refactor that preserves public API — existing behavior tests must still pass
- Duplicating spec sweep coverage for a new element type — extend fixtures + sweep instead

## Running tests

```bash
npm test              # all Vitest
npm run lint          # includes core React import ban
npm run build         # required before deploy (ADR-008)
```

## Phase 4 reminder

Read this file before §18a storage reshape and §18d undo/redo. Dexie v2 will change storage tests; keep adapter-level behavior assertions, not schema version internals.
