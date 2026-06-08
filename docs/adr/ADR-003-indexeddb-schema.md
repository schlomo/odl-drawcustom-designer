# ADR-003: IndexedDB schema

## Status

Accepted (target schema — Phase 4a, 2026-06). **Implementation:** Dexie v1 still uses `projects` + per-`projectId` mocks until §18a lands.

## Context

The designer runs in the browser without access to the user's Home Assistant instance. Fonts, images, HA mock state, and the **current editing session** must persist locally. Multi-project libraries add complexity without matching how users actually share designs (YAML file, hash link, HA automation).

## Decision

Use **Dexie** (IndexedDB wrapper) with these logical stores:

| Store | Contents |
|-------|----------|
| `assets` | Global: `key` (exact YAML path) → `{ blob, mime, updatedAt }` |
| `mocks` | Global: `entityId` → mock value for template preview (one map per browser, like assets) |
| `session` | Single row `current` → `{ name, canvas, service, elements, updatedAt }` — last open design |

`localStorage` holds UI prefs only (theme, snap, panel widths).

**Dexie version bump:** Phase 4a introduces schema v2. **No migration** during initial development — dev/test may wipe the database.

**Removed (was Phase 3a):**

- `projects` store and 20-project LRU
- Per-`projectId` mock compound keys

## Implementation note (Phase 3, pre-4a)

Current code (`src/storage/db.ts`, v1): `assets`, `mocks` compound key `[projectId+entityId]`, `projects` LRU table. UI still tracks an active project id in localStorage. Phase 4a replaces this with the table above — **no migration**, dev wipe OK.

## Consequences

- Large blobs stay out of localStorage size limits
- Opening the app restores the last session automatically
- Hash share (`#d=pako`, ADR-005) excludes assets and mocks; global assets re-bind by path after import
- Embedded HA mode (ADR-010) uses live states instead of mocks when available

## Alternatives considered

- **localStorage only** — rejected; size limits unsuitable for font/image blobs
- **20-project history in IndexedDB** — rejected in 2026-06 plan revision; YAML + hash share are primary portability
- **Per-project mocks** — rejected; one HA instance implies one entity state map
