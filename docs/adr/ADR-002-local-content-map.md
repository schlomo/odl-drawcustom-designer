# ADR-002: Local content map vs YAML-embedded preview

## Status

Accepted

## Context

The previous designer stored clipboard image previews as `preview_data_url` and exported them as YAML comments. Home Assistant strips unrecognized fields when YAML is pasted into automations — previews are lost on HA → designer round-trip.

## Decision

Use a **designer-only local content map**:

- Key = exact string from YAML (`ppb.ttf`, `/local/logo.png`, `https://…`)
- Value = blob + mime in IndexedDB (via Dexie in Phase 3)
- YAML exported for HA contains **only** valid drawcustom fields — no designer metadata or asset comments
- Content Manager UI lists referenced keys with resolved/missing/bundled status

Bundled defaults: `ppb.ttf` and `rbm.ttf` under `public/fonts/` (license permitting).

## Consequences

- Share links restore layout but not asset blobs; user re-uploads by path
- Preview renderer resolves fonts/images through the map at render time
- Optional asset bundle zip (manifest + files) for moving substitutions between machines

## Alternatives considered

- **YAML comments for preview data** — rejected; HA strips on round-trip
- **Base64-embed assets in YAML** — rejected; invalid for HA service calls
