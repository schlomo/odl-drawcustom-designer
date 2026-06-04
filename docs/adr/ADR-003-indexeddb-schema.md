# ADR-003: IndexedDB schema

## Status

Accepted

## Context

The designer runs in the browser without access to the user's Home Assistant instance. Fonts, images, project snapshots, and HA mock state must persist locally across sessions.

## Decision

Use **Dexie** (IndexedDB wrapper) with these logical stores (Phase 3 implementation):

| Store | Contents |
|-------|----------|
| `assets` | `key` (exact YAML path) → `{ blob, mime, updatedAt }` |
| `projects` | Full project snapshots keyed by `id` (LRU max 20) |
| `mocks` | Per-project entity → mock value map for template preview |

`localStorage` holds lightweight index data: UI prefs, 20-project history metadata (name, updatedAt, element count — not full YAML × 20).

## Consequences

- Large blobs stay out of localStorage size limits
- Project history searchable without loading all snapshots
- Share hash excludes assets and mocks by default

## Alternatives considered

- **localStorage only** — rejected; size limits and sync API unsuitable for font/image blobs
- **File System Access API** — rejected as primary; not universally available; may supplement export/import later
