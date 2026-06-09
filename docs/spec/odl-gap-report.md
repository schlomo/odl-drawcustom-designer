# ODL gap report

Audit of draw element parity: [OpenDisplay Language (WIP)](https://opendisplay.org/protocol/open-display-language.html) vs vendored [`supported_types.md`](supported_types.md) vs this designer (schema, renderer, property UI).

**Last reviewed:** Phase 4j (2026-06). **Do not auto-sync** `supported_types.md` from ODL until upstream stabilizes — update this report after manual diff.

## Legend

| Column | Meaning |
|--------|---------|
| **OEPL spec** | `docs/spec/supported_types.md` (HA drawcustom upstream) |
| **ODL** | OpenDisplay Language draft (may lag or differ) |
| **Schema** | Zod in `src/core/schema/elements.ts` |
| **Renderer** | `src/core/renderer/` + `isVisible` where applicable |
| **Property UI** | `getVisibleProperties` / inspector forms |

✅ = supported · ❌ = not documented · ➕ = editor extension beyond both specs · ⚠️ = intentional delta

## Service options (top-level)

| Field | OEPL | ODL | Schema | UI | Notes |
|-------|------|-----|--------|-----|-------|
| `background` | ✅ | ✅ | ✅ | post-v1 | §18g |
| `rotate` | ✅ | ✅ | ✅ | post-v1 | Canvas rotation control ✅ |
| `dither` | ✅ | ✅ | ✅ | post-v1 | Preview pipeline ✅ |
| `ttl` | ✅ | ✅ | ✅ | post-v1 | |
| `dry-run` | ✅ | ✅ | ✅ | post-v1 | |

## Cross-cutting element fields

| Field | OEPL | ODL | Schema | Renderer | Property UI | Notes |
|-------|------|-----|--------|----------|-------------|-------|
| `visible` | 13/16 types | most types | ✅ all 16 | ✅ all 16 | ✅ all 16 | ➕ on `debug_grid`, `polygon`, `arc` (ADR-012) |

## Draw types — field parity summary

| Type | OEPL spec fields | ODL (expected) | Schema | Renderer | Property UI | Gaps / notes |
|------|------------------|----------------|--------|----------|-------------|--------------|
| `debug_grid` | spacing, line_color, dashed, … | same | ✅ | ✅ | ✅ | ➕ `visible` |
| `text` | value, x, y, size, font, color, … | same | ✅ | ✅ | ✅ | |
| `multiline` | value, delimiter, x, offset_y, … | same | ✅ | ✅ | ✅ | ⚠️ `parse_colors` in schema, not in OEPL multiline table |
| `line` | x_start, x_end, y_*, fill, width, … | same | ✅ | ✅ | ✅ | |
| `rectangle` | x_*, y_*, fill, outline, radius, corners | same | ✅ | ✅ | ✅ | |
| `rectangle_pattern` | x/y repeat grid fields | same | ✅ | ✅ | ✅ | |
| `polygon` | points, fill, outline, width | same | ✅ | ✅ | ✅ | ➕ `visible` |
| `circle` | x, y, radius, fill, outline, width | same | ✅ | ✅ | ✅ | |
| `ellipse` | bounding box + fill/outline | same | ✅ | ✅ | ✅ | |
| `arc` | center, radius, angles, fill, outline | same | ✅ | ✅ | ✅ | ➕ `visible` |
| `icon` | value, x, y, size, fill, anchor | same | ✅ | ✅ | ✅ | ⚠️ `color` alias in schema (OEPL examples use `color`) |
| `icon_sequence` | x, y, icons, size, direction, spacing | same | ✅ | ✅ | ✅ | |
| `dlimg` | url, x, y, xsize, ysize, resize, rotate | same | ✅ | ✅ | ✅ | |
| `qrcode` | data, x, y, boxsize, border, colors | same | ✅ | ✅ | ✅ | |
| `plot` | data, axes, legends, bounds, font, … | same | ✅ | ✅ | ✅ | Nested plot fields in property UI |
| `progress_bar` | bounds, progress, direction, colors, font | same | ✅ | ✅ | ✅ | |

All 16 draw type **names** match ODL and OEPL.

## Intentional deltas (keep)

| Delta | Designer behavior | Rationale |
|-------|-------------------|-----------|
| **`multiline.parse_colors`** | Schema + renderer + UI | OEPL text parity; ODL tables omit it — keep until ODL adds or rejects |
| **`icon.color`** | Accepted alias of `fill` in schema | OEPL examples use `color`; ODL documents `fill` — HA export should prefer `fill` when both present |
| **`visible` on debug_grid / polygon / arc** | Full stack support | Cross-cutting UX; upstream ODL WIP may add later (ADR-012) |
| **`TagColorMode.rgb`** | Preview only | Not in Basic Standard `colour_scheme` enum — designer-only (§18i) |
| **Designer overlays** | Hidden hints, debug grid | Not part of tag payload semantics; `visible: false` for designer-only layers (§18m) |

## Basic Standard (wire protocol) — preview mapping only

| Basic Standard | Editor | v1 implementation |
|----------------|--------|-------------------|
| `colour_scheme` 0x00–0x04 | `TagColorMode` bw/bwr/bwy/four/six | Dropdown ✅ (§18i) |
| Rotation 0/90/180/270 | Canvas rotation | ✅ |
| Packet 0x82 image body | PNG export | YAML/PNG ✅; binary encode **post-v1** (ADR-012) |

## Maintenance

1. Periodic manual diff: ODL URL ↔ this table ↔ `supported_types.md`.
2. On OEPL upstream release: review vendored spec; update gap report; run `npm test`.
3. Do **not** bulk-replace `supported_types.md` from ODL until maintainers declare stability.

## References

- ADR-012 — dual-spec strategy and extension rules
- PLAN §7.4 — alignment overview
