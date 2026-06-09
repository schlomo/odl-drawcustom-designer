# ADR-012: OpenDisplay Language alignment and drawcustom export strategy

## Status

Accepted (Phase 4j — 2026-06)

## Context

Home Assistant and OpenEPaperLink today expose draw payloads through the **`drawcustom`** service. [OpenDisplay Language (ODL)](https://opendisplay.org/protocol/open-display-language.html) is the canonical forward name for the same YAML element list. The [OpenDisplay Basic Standard](https://opendisplay.org/protocol/basic-standard.html) defines the **wire protocol** (BLE/Wi‑Fi packets, display announcement, encoded pixels) — complementary to ODL, not a replacement for the editor's YAML model.

The designer must:

1. Align schema, renderer, and property UI with ODL element + service semantics where stable.
2. Keep HA-clean YAML export compatible with today's `drawcustom` integrations.
3. Map display preview config to Basic Standard announcement fields without implementing binary encoding in v1.

Upstream ODL spec is **WIP** (expect churn). We continue vendoring `docs/spec/supported_types.md` from OEPL HA integration and audit deltas in `docs/spec/odl-gap-report.md` — no auto-sync of `supported_types.md` until upstream stabilizes.

## Decision

### Dual-spec editor strategy

| Concern | Forward spec | Export / runtime today |
|---------|--------------|------------------------|
| Element types (16) | ODL draw types | Same names in HA `drawcustom` payload |
| Service options | ODL top-level keys | `background`, `rotate`, `dither`, `ttl`, `dry-run` — schema ✅, UI post-v1 (§18g) |
| Templates | ODL + HA Jinja | Preserved verbatim in export (ADR-004) |
| Cross-cutting fields | ODL documents `visible` on most types | **`visible` on all 16 types** in Zod, renderer, completions, property panel (§18j) |
| Wire image bytes | Basic Standard packet 0x82 | **Post-v1** — document mapping only in v1 |

**Export rule:** Serialized YAML for Home Assistant contains only valid drawcustom/ODL fields — no designer metadata, no preview hacks (ADR-001, yaml-spec rule).

### Basic Standard `colour_scheme` ↔ editor `TagColorMode`

Announcement `colour_scheme` maps to canvas preview mode (`src/core/display/palette.ts`, §18i):

| `colour_scheme` | Basic Standard | Editor `TagColorMode` |
|-----------------|----------------|------------------------|
| `0x00` | Monochrome B/W | `bw` |
| `0x01` | B/W + Red | `bwr` |
| `0x02` | B/W + Yellow | `bwy` |
| `0x03` | B/W + Red + Yellow | `four` |
| `0x04` | 6-color | `six` |
| — | (not in Basic Standard enum) | `rgb` — **designer-only** full-color preview |

Helpers: `colourSchemeToColorMode`, `colorModeToColourScheme`, `isColourSchemeMode`.

**Post-v1 wire-format export:** When implemented, encode preview raster to Basic Standard bitplanes using the active `TagColorMode` → `colour_scheme` mapping above. v1 ships PNG/YAML export only; no packet 0x82 encoder.

### Cross-cutting element fields

`CROSS_CUTTING_ELEMENT_FIELDS = ['visible']` in `src/core/schema/common.ts`.

- Optional on every draw type; template-capable (`boolTemplateSchema`).
- Default `true` when omitted (renderer + property metadata).
- Renderer returns `null` when `visible` evaluates false; canvas skips hit-test and shows designer overlay when "Invisible" toggle is on (`hidden-element-hints.ts`).

ODL upstream does not yet list `visible` on `debug_grid`, `polygon`, or `arc`; we add it proactively so designer behavior is consistent and ODL can adopt without a breaking editor change.

### Extension rules for new ODL fields

When ODL or vendored `supported_types.md` adds fields:

1. **Schema first** — Zod in `src/core/schema/elements.ts` + golden fixture if minimal contract changes.
2. **Renderer** — implement or stub in `src/core/renderer/` with behavior test (ADR-011).
3. **Editor metadata** — `PROPERTIES_BY_TYPE`, `propertyMetadata`, completions.
4. **Gap report** — update `docs/spec/odl-gap-report.md`; do not auto-vendor spec until reviewed.
5. **HA export** — new fields pass through if valid drawcustom/ODL; strip designer-only keys.

Intentional deltas (keep until upstream agrees):

| Field | Our behavior | Notes |
|-------|--------------|-------|
| `multiline.parse_colors` | Supported | OEPL parity; not in ODL tables yet |
| `icon.color` | Alias of `fill` in schema | ODL documents `fill`; export prefers canonical key |
| `visible` on polygon/arc/debug_grid | Supported | Editor extension pending ODL WIP |

## Consequences

- Same payloads work for HA `drawcustom` today and ODL-named integrations later.
- Spec audit table (`docs/spec/odl-gap-report.md`) tracks drift; periodic manual diff against ODL URL.
- §18m can use `debug_grid` + `visible: false` for designer-only overlay without `fill: none` hacks.
- Product rebrand (`odl-designer`) remains a separate decision (§7.5, §18r).

## Alternatives considered

- **ODL-only schema, break HA field aliases** — rejected; breaks existing automations and vendored spec examples.
- **Wait for ODL to document `visible` on polygon/arc/debug_grid** — rejected; inconsistent editor UX until then.
- **Implement Basic Standard binary export in v1** — rejected; out of scope; mapping documented for post-v1.

## References

- PLAN §7.4, §18j
- `docs/spec/odl-gap-report.md`
- `docs/spec/supported_types.md` (vendored OEPL upstream)
- ADR-004 (template scope), ADR-008 (TDD/CI), ADR-011 (behavior tests)
- `src/core/display/palette.ts` (TagColorMode / colour_scheme)
