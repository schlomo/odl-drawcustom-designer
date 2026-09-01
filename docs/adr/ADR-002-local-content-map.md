# ADR-002: Local content map vs YAML-embedded preview

## Status

Accepted. Amended 2026-08-17 (issue #138 layer 1): an embedding host may supply
a **last resolution tier** behind the map and the bundled assets — see
[Host asset resolver](#host-asset-resolver-issue-138) below. Amended
2026-09-01: a host that owns asset resolution may also turn writes into
**tier 1 off entirely** — see [`hostOwnsAssets`](#hostownsassets-read-only-content-tab)
below.

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
  or a silent gap (issue #10). A resolver that never settles counts as "cannot
  supply" after 15s — silence must not read as "still loading" forever.
- Caching is per mount, per `(kind, name)` — the two kinds share no namespace.
  Supplied assets are cached for the mount's life; an unsupplied one is asked
  again on the **next asset-affecting load pass that runs 30s or more after the
  decline**. There is no background timer and nothing wakes the designer, so
  healing is edit-driven, not clock-driven. Full contract:
  [`docs/embedding.md`](../embedding.md#resolveasset-issue-138).
- A mount's disposal is the boundary of the host's bytes: the parsed font, the
  font registry entry and the CSS `@font-face` a host supplied are all evicted
  with it, so a second host on the same page cannot inherit them.
- Content Manager badges such a key **Host** rather than **Missing**, and the
  missing-asset warning does not fire for it.

## `hostOwnsAssets`: read-only Content tab

A host that resolves its own assets (the resolver above, or otherwise) turns
the local content map's *write* path into a trap: an upload lands in this
one browser's IndexedDB, renders fine on the canvas (it is read straight back
out of that same map), and then fails the moment the design is sent, because
whatever finally draws it looks in the host's own directories and finds
nothing. Found on real hardware (a maintainer's live Home Assistant panel),
not hypothesized.

`MountOptions.hostOwnsAssets` (`true`, or `{ hint }` — see
[`docs/embedding.md`](../embedding.md#hostownsassets-adr-002)) declares this
explicitly — **never inferred from `resolveAsset`'s presence**, since a host
may legitimately want the resolver tier *and* local uploads together:

- **Tier order is unchanged.** Local content map → bundled → `resolveAsset`
  (above) still resolves in that order; this option stops new writes from
  reaching tier 1, it does not reorder or remove any tier, and anything
  already stored still resolves and still lists.
- **The tab stays a read-only explorer, not an empty one.** Content Manager
  keeps listing every key the current payload references and how it
  resolves — **Host**-badged rows included — with every write affordance
  (upload/replace, delete, the font/image-URL property-field upload
  controls) removed from the render tree. This does **not** give the
  designer a directory-browsing API into the host's own asset library; the
  contract stays `name -> asset` (previous section).
- **Enforced at the write boundary, not only the UI.** The designer's
  `uploadAsset`/`clearAsset` refuse outright when this is set, so a
  reachable control is only ever the first line of defense.
- **The published surface stays domain-neutral (ADR-018).** The designer
  cannot word "upload to your media folder" for you — an optional `hint`
  string lets the host supply that sentence in its own words, rendered as
  plain text only (never HTML/Markdown), with a neutral designer-authored
  fallback when absent.

## Alternatives considered

- **YAML comments for preview data** — rejected; HA strips on round-trip
- **Base64-embed assets in YAML** — rejected; invalid for HA service calls
