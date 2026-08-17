# ADR-002: Local content map vs YAML-embedded preview

## Status

Accepted. Amended 2026-08-17 (issue #138 layer 1): an embedding host may supply
a **last resolution tier** behind the map and the bundled assets — see
[Host asset resolver](#host-asset-resolver-issue-138) below.

## Context

The previous designer stored clipboard image previews as `preview_data_url` and exported them as YAML comments. Home Assistant strips unrecognized fields when YAML is pasted into automations — previews are lost on HA → designer round-trip.

## Decision

Use a **designer-only local content map**:

- Key = exact string from YAML (`ppb.ttf`, `/local/logo.png`, `https://…`)
- Value = blob + mime in IndexedDB (via Dexie, ADR-003)
- YAML exported for HA contains **only** valid drawcustom fields — no designer metadata or asset comments
- Content Manager UI lists referenced keys with resolved/missing/bundled status

Bundled defaults: `ppb.ttf` and `rbm.ttf` under `public/fonts/` (license permitting).

## Consequences

- Share links restore layout but not asset blobs; user re-uploads by path
- Preview renderer resolves fonts/images through the map at render time
- Optional asset bundle zip (manifest + files) for moving substitutions between machines

## Host asset resolver (issue #138)

An embedded designer sees payloads written against the *host's* asset names
(`Ubuntu-R.ttf`, `logo.png` — the ODL integration's own font/media
directories), which no local map can contain. `MountOptions.resolveAsset(kind,
name)` closes that gap as the **last tier**:

1. local content map (this ADR)
2. bundled assets (`ppb.ttf`, `rbm.ttf`, showcase image)
3. host resolver — asked only for what tiers 1–2 could not resolve

Consequences:

- A user upload always overrides the host's copy; a bundled font never costs a
  host round trip.
- The contract is `name -> asset` (blob or URL). Search paths, directory layout
  and permissions stay host-side (ADR-018 domain-neutral vocabulary) — the
  designer implements no search order of its own.
- Anything the host cannot supply reaches the user as the existing explicit
  render-error state, naming the asset and the host; never a substituted font
  or a silent gap (issue #10).
- Caching is per mount, per `(kind, name)`: supplied assets for the mount's
  life, unsupplied ones briefly (30s) and then retried, so a host store that
  comes back needs no remount. Full contract:
  [`docs/embedding.md`](../embedding.md#resolveasset-issue-138).
- Content Manager badges such a key `HOST` rather than `MISSING`, and the
  missing-asset warning does not fire for it.

## Alternatives considered

- **YAML comments for preview data** — rejected; HA strips on round-trip
- **Base64-embed assets in YAML** — rejected; invalid for HA service calls
