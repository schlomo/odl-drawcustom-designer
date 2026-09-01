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
- **`y`-absent start differs — deliberate non-goal**, see
  [The flow cursor](#the-flow-cursor-ctxpos_y--deliberate-non-goal) below.
  Upstream falls back to the flow cursor, `ctx.pos_y + y_padding`
  (`y_padding` default `10`), and also accepts a legacy `start_y`. The
  designer starts such a block at `0`. Neither `start_y` nor `y_padding` is
  supported on `multiline`.
- **Per-line anchor — closed.** Upstream draws each line with
  `anchor=element.get("anchor", "lm")` on the plain path and hard-codes `lt`
  on the `parse_colors` path. The designer used ink-bound `lt` throughout,
  which hung every multiline block a metric half-box below the device
  (maintainer side-by-side finding, 2026-09-01). It now applies the anchor per
  line with Pillow's own semantics — `a`/`m`/`s`/`d` font-metric, `t`/`b`
  ink-following — and honours an explicit `anchor`, which the schema
  previously rejected outright. See
  [supported_types.md](supported_types.md#anchor-multiline-defaults-to-lm-text-defaults-to-lt).
- **`align` is still unsupported on `multiline`.** Upstream reads it
  (`element.get("align", "left")`) but consumes it only on the `parse_colors`
  path, via `calculate_segment_positions`. Not in the designer's schema.

### The flow cursor (`ctx.pos_y`) — deliberate non-goal

The drawcustom language carries one mutable vertical cursor through a payload,
so an element that omits its `y` is stacked below whatever was drawn before it.
The designer does not implement this and **will not** (maintainer ruling
2026-09-01). It is recorded here so the divergence is documented, not so it is
picked up later.

**This is not an ODL quirk — it is drawcustom itself.** `odl_renderer` is a
fork of OpenEPaperLink's `custom_components/open_epaper_link/imagegen/`
package: same file layout, same handlers, same logic. The behavior below is
identical in both, so `y_padding` is OEPL-inherited vocabulary rather than
something ODL introduced. Citations give the local `odl_renderer` file:line
plus the corresponding OEPL path in
[`OpenEPaperLink/Home_Assistant_Integration`](https://github.com/OpenEPaperLink/Home_Assistant_Integration).

**What both renderers do.** `pos_y` starts at `0` (`types.py:115`, set in
`core.py:79`) and elements are drawn in one sequential pass. Hidden elements
`continue` before their handler runs (`core.py:87-89`), so they never advance
it.

**Twenty sites write the cursor** — every handler advances it — but only
**four handlers read it**:

| Handler | `odl_renderer` | OEPL `imagegen/` | `y_padding` default |
|---|---|---|---|
| `text` | `text.py:38` | `text.py` `draw_text` | `10` |
| `multiline` | `text.py:180` | `text.py` `draw_multiline` | `10` |
| `line` | `shapes.py:32` | `shapes.py` `draw_line` | `0` |
| `diagram` | `visualizations.py:779-877` | `visualizations.py` `draw_diagram` | — reads no `y` at all |

`diagram` is positioned entirely from the cursor: its handler declares
`requires=["x", "height"]` (`visualizations.py:779`) and takes no vertical
coordinate whatsoever. So drawcustom's own flow model is half-used —
universally written, consumed by four handlers.

The designer's 16 types are `debug_grid`, `text`, `multiline`, `line`,
`rectangle`, `rectangle_pattern`, `polygon`, `circle`, `ellipse`, `arc`,
`icon`, `icon_sequence`, `dlimg`, `qrcode`, `plot` and `progress_bar` —
`diagram` is not among them, tracked separately in
[Unimplemented element: `diagram`](#unimplemented-element-diagram). The
freely-positioned chart we do support is **`plot`**, a structurally unrelated
element that takes explicit coordinates.

**Why not implement it.** Beyond the maintainer's design objection — cursor-based
dynamic vertical positioning is a poor fit for a fixed-size graphical display,
especially one that only a subset of handlers honours — it collides with how
the designer renders. Each element draws in its own memoized slot
(`src/ui/components/CanvasElementSlot.tsx`), and
[`tests/e2e/drag-repaint-scope.spec.ts`](../../tests/e2e/drag-repaint-scope.spec.ts)
asserts that dragging one element repaints **no other element's canvas layer**.
A cursor makes every element's position depend on all the elements before it,
so any edit would have to invalidate every later slot — reversing a deliberate
performance property. It would also make element order silently reposition
`y`-less elements, which the canvas, hit-testing, alignment and drag geometry
all assume cannot happen.

**Practical consequence.** A hand-authored or imported payload that omits `y`
on `text`, `multiline` or `line` renders at **y=0** in this designer
(`text.ts:62`, `line.ts:21` via `resolveY(undefined)`, `multiline.ts:72`),
while the device stacks it below the preceding elements. Everything the
designer itself authors carries explicit coordinates, so this only affects
YAML written by hand or brought in from elsewhere.

### Unimplemented element: `diagram`

A real, functional element type in both renderers that the designer does not
support. Recorded because it was previously untracked in this report and in
[`supported_types.md`](supported_types.md).

- **What it is.** `@element_handler(ElementType.DIAGRAM, requires=["x", "height"])`
  (`visualizations.py:779`). Draws axes plus an optional bar chart parsed from
  a semicolon/comma string, e.g. `"Mon,10;Tue,20;Wed,15"`. Positioned entirely
  from the flow cursor — it reads no `y`.
- **Provenance.** OEPL-original
  (`custom_components/open_epaper_link/imagegen/visualizations.py`), inherited
  by the `odl_renderer` fork. Present and functional in both today.
- **Undocumented upstream.** It is absent from *both* projects' official
  `docs/drawcustom/supported_types.md`. It surfaces only in `odl_renderer`'s
  own PyPI README (`odl_renderer-0.5.12.dist-info/METADATA`, `#diagram`).
- **Apparently dormant.** `plot` has active feature work through late 2025
  (`span_gaps`, `line_style`); `diagram` has none. It is **not** an older
  generation of `plot` — the two are structurally unrelated and coexist.
- **What a user sees.** A payload with `type: diagram` parses as YAML but
  fails schema validation, so the YAML editor flags the `type:` line with
  `type: Invalid discriminator value. Expected 'debug_grid' | … |
  'progress_bar'` and, as with any invalid payload, canvas and property
  editing stay blocked until it is corrected (the text itself is preserved).

No support is proposed here; this entry exists to track the gap.

## Intentional deltas (keep)

| Delta | Designer behavior | Rationale |
|-------|-------------------|-----------|
| **`multiline.parse_colors`** | Schema + renderer + UI | OEPL text parity; ODL tables omit it — keep until ODL adds or rejects |
| **Flow cursor (`ctx.pos_y`)** | Not implemented; a missing `y` renders at `0` | Maintainer ruling 2026-09-01 — see [The flow cursor](#the-flow-cursor-ctxpos_y--deliberate-non-goal). Poor fit for a fixed-size display, honoured by only 4 of the ~20 handlers that advance it (same in OEPL and ODL), and incompatible with per-element memoized rendering |
| **`diagram` element** | Not implemented | Undocumented in both upstreams and apparently dormant — see [Unimplemented element: `diagram`](#unimplemented-element-diagram). Tracked, not proposed |
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
