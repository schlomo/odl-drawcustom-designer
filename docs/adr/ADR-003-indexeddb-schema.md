# ADR-003: IndexedDB schema

## Status

Accepted

## Context

The designer runs in the browser without access to the user's Home Assistant instance. Fonts, images, HA mock state, and the **current editing session** must persist locally. Multi-project libraries add complexity without matching how users actually share designs (YAML file, hash link, HA automation).

## Decision

Use **Dexie** (IndexedDB wrapper) with these logical stores:

| Store | Contents |
|-------|----------|
| `assets` | Global: `key` (exact YAML path) → `{ blob, mime, updatedAt }` |
| `mocks` | Global: `entityId` → `{ value, attributes? }` for template preview (one map per browser, like assets). `value` is the state string/number/boolean; `attributes` is a per-entity map of **typed** attribute values (ADR-004) |
| `variables` | Global: `name` → `{ name, value }` user-defined Simulator variables — **literal** mock values injected as template globals (ADR-004). One map per browser, like mocks |
| `session` | Single row `current` → `{ name, canvas, service, elements, editHistory?, updatedAt }` — last open design plus undo/redo stacks (50 steps max) |

`localStorage` holds UI prefs only (theme, snap, panel widths).

**Dexie version:** schema v5 (`DesignerDatabase.version(5)`).

- **v2** drops `mocks`/`projects` stores when the primary key changes (delete/recreate).
- **v3** establishes the current stores: `assets`, `mocks` (`entityId` key), `session` (`id` key).
- **v4** adds the non-indexed `attributes` map to each `mocks` row (issue #4, PR #9). The primary key is unchanged, so this is a **non-destructive** upgrade: existing `{ entityId, value }` rows are preserved and `attributes` defaults to `{}` for legacy rows.
- **v5** adds the `variables` store (`name` key) for user-defined Simulator variables (PR #8). Purely **additive** — Dexie only re-keys stores it is told to change, so existing `assets`/`mocks` (incl. v4 `attributes`)/`session` rows survive untouched.

`ensureDbReady()` deletes and reopens on `UpgradeError` if an upgrade is not recoverable.

**No further version bump for typed attributes.** Attribute values are stored as **typed JSON** (boolean/number/null/array/object/string) directly in the v4 `attributes` field and round-trip via IndexedDB structured clone — no stringification, no index, so no schema change is needed beyond v4. Legacy attribute values load as-is (non-destructive) and are re-typed by the simulator on edit (see `coerceAttributeValue`, ADR-004). **Variable values** are likewise stored verbatim as strings (no coercion — they are literal mock values).

**Showcase seed vs persisted mocks:** first-run defaults for `mocks` and `variables` come from `src/assets/showcase/showcase.json` (ADR-015), not hardcoded TypeScript. Once the user edits the State Simulator, IndexedDB holds their data; **Clear all** removes only entries that still match the unmodified showcase seed (`clear-demo-data.ts`).

## Implementation

- `src/storage/db.ts` — Dexie v5 stores: `assets`, `mocks` (`entityId` key, with `attributes` map), `variables` (`name` key), `session` (`id` key)
- `src/storage/session.ts` — read/write single `current` row
- `src/storage/mocks.ts` — global entity map (no `projectId`); reads/writes `value` + typed `attributes` per entity
- `src/storage/variables.ts` — global `name → value` map for user-defined Simulator variables
- `src/ui/hooks/useProjectState.ts` — debounced auto-save for session (including `editHistory`) + mocks + variables; hydrate on app load; clear history on hash/example/clear-all loads

**Not used:**

- Multi-project library / `projects` store
- Per-project mock compound keys (`[projectId+entityId]`)

## Consequences

- Large blobs stay out of localStorage size limits
- Opening the app restores the last session automatically
- Hash share (`#d=eJ…`, ADR-005) excludes assets, mocks, and variables; global assets re-bind by path after import
- Embedded HA mode (ADR-010) uses live states instead of mocks when available

## Alternatives considered

- **localStorage only** — rejected; size limits unsuitable for font/image blobs
- **20-project history in IndexedDB** — rejected; YAML + hash share are primary portability
- **Per-project mocks** — rejected; one HA instance implies one entity state map
