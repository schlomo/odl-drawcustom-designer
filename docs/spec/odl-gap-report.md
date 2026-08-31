# ODL gap report

Audit of draw element parity: [OpenDisplay Language (WIP)](https://opendisplay.org/protocol/open-display-language.html) vs vendored [`supported_types.md`](supported_types.md) vs this designer (schema, renderer, property UI).

**Do not auto-sync** `supported_types.md` from ODL until upstream stabilizes — update this report after manual diff.

## Legend

| Column | Meaning |
|--------|---------|
| **HA drawcustom** | `docs/spec/supported_types.md` — [upstream](https://github.com/OpenEPaperLink/Home_Assistant_Integration/blob/main/docs/drawcustom/supported_types.md) |
| **ODL** | [OpenDisplay Language](https://opendisplay.org/protocol/open-display-language.html) (WIP; may lag or differ) |
| **Schema** | Zod in `src/core/schema/elements.ts` |
| **Renderer** | `src/core/renderer/` + `isVisible` where applicable |
| **Property UI** | `getVisibleProperties` / inspector forms |

✅ = supported · ❌ = not documented · ➕ = editor extension beyond both specs · ⚠️ = intentional delta

## Service options (top-level)

| Field | OEPL | ODL | Schema | UI | Notes |
|-------|------|-----|--------|-----|-------|
| `background` | ✅ | ✅ | ✅ | — | Schema + session/share only |
| `rotate` | ✅ | ✅ | ✅ | ❌ | **Not emitted** (issue #139). The designer's rotation control chooses the *orientation of the logical drawing surface* (W/H swap); it is never written into the payload, session or share hash as `rotate`. That rotation is **absolute** — seeded from the host, changed by the user, never summed with a base rotation. The send-time value is per-target output metadata and lands via the service-options seam ([issue #105](https://github.com/schlomo/odl-drawcustom-designer/issues/105)), which carries the canvas rotation as-is (or a value the host computes per target from it) |
| `dither` | ✅ | ✅ | ✅ | ✅ | Canvas preview dither toggle → share/session |
| `ttl` | ✅ | ✅ | ✅ | — | Schema + session/share only |
| `dry-run` | ✅ | ✅ | ✅ | — | Schema + session/share only |

## Cross-cutting element fields

| Field | OEPL | ODL | Schema | Renderer | Property UI | Notes |
|-------|------|-----|--------|----------|-------------|-------|
| `visible` | 13/16 types | most types | ✅ all 16 | ✅ all 16 | ✅ all 16 | ➕ on `debug_grid`, `polygon`, `arc` (ADR-012) |

## Draw types — field parity summary

| Type | OEPL spec fields | ODL (expected) | Schema | Renderer | Property UI | Gaps / notes |
|------|------------------|----------------|--------|----------|-------------|--------------|
| `debug_grid` | spacing, line_color, dashed, … | same | ✅ | ✅ | ✅ | ➕ `visible` |
| `text` | value, x, y, size, font, color, … | same | ✅ | ✅ | ✅ | |
| `multiline` | value, delimiter, x, offset_y, … | same | ✅ | ✅ | ✅ | ⚠️ `parse_colors` in schema, not in OEPL multiline table · ⚠️ `spacing` accepted but ignored · ⚠️ `y`-absent start differs — see [multiline line advance](#multiline-line-advance-offset_y) |
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

### Multiline line advance (`offset_y`)

Verified against the authoritative renderer, `odl_renderer/elements/text.py`,
`draw_multiline`:

```python
offset_y = int(coerce_number(element["offset_y"]))
...
for line in lines:
    draw.text((x, current_y), str(line), ...)
    current_y += offset_y
```

- **`offset_y` is the per-line advance**, absolute pixels, and is required
  (`requires=["x", "value", "delimiter", "offset_y"]`). The designer renderer
  matches this ([issue #169](https://github.com/schlomo/odl-drawcustom-designer/issues/169)).
- **`spacing` is not a `multiline` field.** `draw_multiline` never reads it;
  it belongs to `draw_text` (`element.get("spacing", 5)`). The designer keeps
  it in the `multiline` schema so existing payloads still load, and ignores it
  in the renderer exactly as upstream does. It is not offered in the property
  UI for `multiline`.
- **`y`-absent start still differs.** Upstream falls back to the document flow
  position, `ctx.pos_y + y_padding` (`y_padding` default `10`), and also
  accepts a legacy `start_y`. The designer renderer has no flow-position
  concept and starts such a block at `0`. Neither `start_y` nor `y_padding` is
  supported on `multiline`. Open gap — a `multiline` with no `y` renders at a
  different height than on the device.
- **Per-line anchor still differs.** Upstream draws each line with
  `anchor=element.get("anchor", "lm")` on the plain path (and hard-codes `lt`
  on the `parse_colors` path); the designer uses ink-bound `lt` throughout.
  Open gap, same class as the text glyph differences in ADR-007.

## Intentional deltas (keep)

| Delta | Designer behavior | Rationale |
|-------|-------------------|-----------|
| **`multiline.parse_colors`** | Schema + renderer + UI | OEPL text parity; ODL tables omit it — keep until ODL adds or rejects |
| **`icon.color`** | Accepted alias of `fill` in schema | OEPL examples use `color`; ODL documents `fill` — HA export should prefer `fill` when both present |
| **`visible` on debug_grid / polygon / arc** | Full stack support | Cross-cutting UX; upstream ODL WIP may add later (ADR-012) |
| **`TagColorMode.rgb`** | Preview only | Not in Basic Standard `colour_scheme` enum — designer-only preview mode |
| **Designer overlays** | Hidden hints, debug grid | Not part of tag payload semantics; `visible: false` for designer-only layers |

## Basic Standard (wire protocol) — preview mapping only

| Basic Standard | Editor | v1 implementation |
|----------------|--------|-------------------|
| `colour_scheme` 0x00–0x04 | `TagColorMode` bw/bwr/bwy/four/six | Display config dropdown ✅ |
| Rotation 0/90/180/270 | Canvas orientation | Surface orientation ✅ (W/H swap, canvas drawn upright); **`rotate` not emitted** — see service options above |
| Packet 0x82 image body | PNG export | YAML/PNG ✅; binary encode **post-v1** (ADR-012) |

## Maintenance

1. Periodic manual diff: ODL URL ↔ this table ↔ `supported_types.md`.
2. On OEPL upstream release: review vendored spec; update gap report; run `npm test`.
3. Do **not** bulk-replace `supported_types.md` from ODL until maintainers declare stability.

## References

- ADR-012 — dual-spec strategy and extension rules
- ADR-014-product-naming — product slug and ODL/OEPL discoverability in titles
