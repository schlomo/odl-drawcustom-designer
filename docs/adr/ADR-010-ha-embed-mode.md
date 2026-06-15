# ADR-010: Home Assistant embed mode

## Status

Accepted — **implementation deferred post-v1**. Do not code embed bridge until owner aligns with HA / OpenEPaperLink maintainers on the message contract below.

## Context

The designer runs standalone on GitHub Pages today. The primary long-term host is **inside Home Assistant** as a design editor for `open_epaper_link.drawcustom` payloads in automations, scripts, and dashboards.

Standalone mode uses a **State Simulator** with globally persisted mock entity values. Embedded mode should use **live HA entity states** for template preview and load/save the draw payload from the parent editor.

## Decision

Support **two runtimes** with one shared `src/core/` + React shell:

| Mode | Detection | State for templates | Persistence |
|------|-----------|---------------------|-------------|
| **Standalone** | Default (GH Pages) | Global mocks in IndexedDB + State Simulator UI | Last `session` row + global assets/mocks |
| **Embedded** | HA-provided context (TBD: query flag, `postMessage` handshake, or custom panel API) | Live states from HA (REST or websocket) | Parent owns payload; designer returns updated YAML/JSON on Save |

**Parent ↔ designer contract (minimum v1):**

- `load` — parent sends `{ canvas, service, elements, name? }` (drawcustom payload slice)
- `save` — designer posts same shape back on explicit Save (no auto-write to HA)
- `states` — embedded runtime supplies `entity_id → state` map for template evaluation; standalone uses global mocks

**Out of scope for first embed pass:** registering a production HA custom panel, OAuth implementation details, or writing automations without user confirmation.

## Consequences

- Core template evaluator stays identical; only the state provider swaps (`MockStateProvider` vs `HaLiveStateProvider`)
- Share hash (`#d=eJ…`, ADR-005) remains standalone-first; embedded mode may ignore URL hash
- CORS and auth for HA API calls must be documented per deployment (same-origin when embedded in HA frontend is ideal)

## Alternatives considered

- **Standalone only** — rejected; HA embed is a stated product goal
- **Include mocks in share hash** — rejected; live HA states replace mocks when embedded; global mocks sufficient for standalone
