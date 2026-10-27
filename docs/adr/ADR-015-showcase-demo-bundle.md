# ADR-015: Showcase demo bundle (file-based)

## Status

Accepted

## Context

The built-in **Load Demo** layout and its State Simulator seed were originally hardcoded in TypeScript (`sample-elements.ts`, `mockStates.ts`, `variables.ts`). That duplicated the YAML the user edits in the designer, drifted from block-scalar formatting, and split demo maintenance across unrelated modules.

## Decision

Colocate the entire demo bundle under **`src/assets/showcase/`** and load it at build time:

| File | Role |
|------|------|
| **`showcase.yml`** | Draw payload (elements, templates, layout) — edited as YAML |
| **`showcase.json`** | Canvas config + State Simulator seed (`states`, `attributes`, `variables`) |
| **`showcase.png`** | Bundled dlimg asset (`/local/showcase.png`) |

**Loader:** `src/ui/data/showcase.ts` imports the YAML (`?raw`) and JSON, validates the payload with `validatePayload`, and exports `SHOWCASE_ELEMENTS`, `SHOWCASE_CANVAS`, simulator seed constants, and `cloneShowcaseElements()` / `cloneShowcaseSimulator()` for Load Demo.

**First-run defaults:** when IndexedDB has no stored mocks/variables, `readMockStates()` / `readVariables()` return the showcase simulator seed from `showcase.json` (not separate hardcoded maps).

**Clear all:** `src/ui/lib/clear-demo-data.ts` strips only simulator entries that still match the showcase seed; user-added or edited mocks are preserved.

**Empty session bootstrap:** when the saved session has no elements, the app loads `SHOWCASE_ELEMENTS` + `SHOWCASE_CANVAS` (same files).

## Consequences

- Edit the demo by changing files in `src/assets/showcase/` — no TS array to sync.
- Product title strings for the demo live in `showcase.yml` (not `brand.ts`).
- Tests assert bundle integrity in `tests/ui/data/showcase-bundle.test.ts`.
- Share links and IndexedDB still exclude showcase seed unless the user has persisted overrides.
- `showcase.yml` and `showcase.json` ship in the npm package (`tools/stageNpmPackage.ts`) so a host can render the demo through its own pipeline — the Home Assistant integration's test-suite renders it with real Python Jinja, the only check that catches templates the JS preview coerces silently but HA rejects (issue #196). `showcase.png` is bundled into the ESM and not shipped separately.

## Alternatives considered

- **Single `showcase.yaml` with canvas + simulator + payload** — rejected; draw payload stays YAML-list-shaped for copy/paste into HA; simulator uses JSON types for attributes.
- **Keep TS constants as source of truth** — rejected; caused Load Demo / user YAML drift.
