# ADR-003: IndexedDB schema

## Status

Accepted (implemented — Phase 4a, 2026-06).

## Context

The designer runs in the browser without access to the user's Home Assistant instance. Fonts, images, HA mock state, and the **current editing session** must persist locally. Multi-project libraries add complexity without matching how users actually share designs (YAML file, hash link, HA automation).

## Decision

Use **Dexie** (IndexedDB wrapper) with these logical stores:

| Store | Contents |
|-------|----------|
| `assets` | Global: `key` (exact YAML path) → `{ blob, mime, updatedAt }` |
| `mocks` | Global: `entityId` → mock value for template preview (one map per browser, like assets) |
| `session` | Single row `current` → `{ name, canvas, service, elements, editHistory?, updatedAt }` — last open design plus undo/redo stacks (50 steps max) |

`localStorage` holds UI prefs only (theme, snap, panel widths).

**Dexie version:** schema v3 (`OeplDatabase.version(3)`). Versions 2–3 drop legacy `mocks`/`projects` stores (primary-key change requires delete/recreate). **No data migration** from v1 during initial development — dev/test may wipe the database; `ensureDbReady()` deletes and reopens on `UpgradeError`.

## Implementation

- `src/storage/db.ts` — Dexie v2 stores: `assets`, `mocks` (`entityId` key), `session` (`id` key)
- `src/storage/session.ts` — read/write single `current` row
- `src/storage/mocks.ts` — global entity map (no `projectId`)
- `src/ui/hooks/useProjectState.ts` — debounced auto-save for session (including `editHistory`) + mocks; hydrate on app load; clear history on hash/example/clear-all loads

**Removed (Phase 3a, superseded in 4a):**

- `projects` store and 20-project LRU
- Per-`projectId` mock compound keys
- `projectId.ts` and active-project id in `localStorage`

## Consequences

- Large blobs stay out of localStorage size limits
- Opening the app restores the last session automatically
- Hash share (`#d=eJ…`, ADR-005) excludes assets and mocks; global assets re-bind by path after import
- Embedded HA mode (ADR-010) uses live states instead of mocks when available

## Alternatives considered

- **localStorage only** — rejected; size limits unsuitable for font/image blobs
- **20-project history in IndexedDB** — rejected in 2026-06 plan revision; YAML + hash share are primary portability
- **Per-project mocks** — rejected; one HA instance implies one entity state map
