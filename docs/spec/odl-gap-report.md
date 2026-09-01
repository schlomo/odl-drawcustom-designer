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
  it belongs to `draw_text` (`element.get("spacing", 5)`). It is not in the
  designer's `multiline` schema, not read by the renderer, and not offered in
  the property UI. In the editor it reads as an unknown key; on **import** it
  is removed outright — see
  [`multiline.spacing` is not accepted](#multilinespacing-is-not-accepted).
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

Drawcustom positions an element that omits its vertical coordinate from a
running cursor, stacking it below the previous element. **The designer does not
implement this and will not** (maintainer ruling 2026-09-01): cursor-based
dynamic vertical positioning is a poor fit for a fixed-size graphical display,
and only a subset of handlers honours it.

The cursor starts at `0` (`types.py:115`, set in `core.py:79`); hidden elements
`continue` before their handler runs (`core.py:87-89`) so never advance it.
Twenty sites write it — every handler — but only four read it:

| Handler | `odl_renderer` | `y_padding` default |
|---|---|---|
| `text` | `text.py:38` | `10` |
| `multiline` | `text.py:180` | `10` |
| `line` | `shapes.py:32` | `0` |
| `diagram` | `visualizations.py:779-877` | reads no `y` at all |

Same in OEPL, whose `imagegen` package `odl_renderer` forks.

**Architectural cost, so this is not reopened blindly.** Each element renders
in its own memoized slot (`src/ui/components/CanvasElementSlot.tsx`), and
[`tests/e2e/drag-repaint-scope.spec.ts`](../../tests/e2e/drag-repaint-scope.spec.ts)
asserts that dragging one element repaints no other element's canvas layer. A
cursor makes every element's position depend on all elements before it, so any
edit would invalidate every later slot — reversing a deliberate performance
property. It would also let element order silently reposition `y`-less
elements, which the canvas, hit-testing, alignment and drag geometry all assume
cannot happen.

**Consequence.** A payload that omits `y` on `text`, `multiline` or `line`
renders at `0` here (`text.ts:62`, `line.ts:21` via `resolveY(undefined)`,
`multiline.ts:72`) and stacked on the device. Only affects hand-written or
imported YAML — everything the designer authors carries explicit coordinates.

**What the designer does about it.** An *imported* payload does not keep the
disagreement: the coordinate is written out as an explicit `0` and the user is
told, so the YAML says what the canvas draws. A document the user is typing is
never rewritten. See
[Import normalization](#import-normalization--what-the-designer-writes-into-an-imported-payload).

### Unimplemented element: `diagram`

`@element_handler(ElementType.DIAGRAM, requires=["x", "height"])`
(`visualizations.py:779`) draws axes plus an optional bar chart parsed from a
string like `"Mon,10;Tue,20;Wed,15"`, positioned entirely from the flow cursor.
OEPL-original, inherited by the `odl_renderer` fork; functional in both.

Undocumented in both projects' official `docs/drawcustom/supported_types.md`.
Not implemented here, and unrelated to `plot`, the explicitly-positioned chart
the designer does support.

A `type: diagram` payload parses as YAML but fails schema validation, so the
editor flags the `type:` line with `Invalid discriminator value` listing the
supported types, and canvas and property editing stay blocked until it is
corrected. No support is proposed; this entry tracks the gap.

### `multiline.offset_y` authoring default

`offset_y` is required upstream with no default (`requires=[..., "offset_y"]`),
so the value the designer inserts is purely ours: `round(1.3 × size)` — `26` at
the default size 20 (maintainer ruling 2026-09-01) — surfaced in the property
panel as the effective default. It scales with `size` because a fixed pixel
advance is wrong at every other size. `1.3` is a legibility choice, not a font
metric: the bundled fonts have natural line-height ratios of `1.400`
(`ppb.ttf`) and `1.172` (`rbm.ttf`).

### `multiline.spacing` is not accepted

`spacing` is a `text` field (`draw_text`, default `5`); `draw_multiline` never
reads it. It is therefore not in the designer's `multiline` schema, and the two
entry points treat it differently on purpose:

- **In the editor it is flagged, never touched.** The document reports it as an
  unknown key like any other typo. Nothing is deleted from text the user is
  typing (ADR-009), and no special case exists to maintain.
- **On import it is removed** (maintainer ruling 2026-09-01: the designer
  invented the key, and there are no users of it in the wild). Without that, a
  shared or host-pushed payload carrying it would land in the editor already
  failing validation, with the canvas blocked on a key that never did anything.
  Removing it changes nothing on screen, and the notice says so — see
  [Import normalization](#import-normalization--what-the-designer-writes-into-an-imported-payload).

## Import normalization — what the designer writes into an imported payload

Two upstream behaviours have no designer equivalent, and rather than leave an
imported payload meaning one thing here and another on the device, the designer
makes it explicit **on import** and says so in a dismissible info banner naming
the count and the element types. Nothing else in the document is touched, and
re-importing an already-normalized payload changes nothing and shows nothing.

| Rewrite | Types | What it does | Can it move anything? |
|---|---|---|---|
| Missing vertical coordinate → `0` | `text` / `multiline` (`y`), `line` (`y_start`) | Writes the coordinate the designer was already rendering at | **Yes** — the device would have stacked these |
| Drop `spacing` | `multiline` only | Removes a key upstream never reads | **No** |

**The vertical coordinate.** Drawcustom positions `text`, `multiline` and
`line` from a running document-flow cursor when their vertical coordinate is
omitted — `ctx.pos_y + y_padding`, stacking each below the one before
(`y_padding` defaults to `10` for `text`/`multiline`, `0` for `line`). The
designer has no cursor and will not get one — see
[The flow cursor](#the-flow-cursor-ctxpos_y--deliberate-non-goal) — so it
renders such elements at `0`. **Plainly: the device would have stacked these elements; the designer
places them at 0.** Import writes that `0` into the YAML so the document, the
canvas and the device finally agree on one answer, accepting a layout that may
differ from what the device would have drawn — which is exactly what the notice
warns about. `multiline`'s legacy `start_y` alias is not supported and is not
normalized.

**`multiline.spacing`.** `spacing` is a `text` field upstream (`draw_text`,
default `5`); `draw_multiline` never reads it. The designer invented that
meaning, so import deletes the key. This changes nothing on screen — and it
matters more than tidiness now that the `multiline` schema is `.strict()`
without it: an imported payload carrying `spacing` would otherwise arrive
already failing validation, blocking the canvas on a key that never did
anything. In the editor the key is still flagged rather than removed
(ADR-009). `spacing` on `text`, `debug_grid` and `icon_sequence` is real and
is never touched.

**Where this applies.** Only where a payload enters the designer from outside
its own document:

| Path | Normalized | Why |
|---|---|---|
| Share hash `#d=` (ADR-005) | ✅ | Someone else's design arriving in this designer |
| Host `payload` mount option and `setPayload()` push (ADR-018) | ✅ | A mount option is an initial push; `getPayload()` then reports what the canvas shows |
| YAML editor — typing, pasting | ❌ | Rewriting the document as the user types is hostile and fights ADR-009's echo contract. The editor's `validatePayload` path never normalizes |
| Restored IndexedDB session | ❌ | The designer's own committed document round-tripping, not an import — normalizing it would rewrite the user's work on every reload |
| Built-in demo bundle (`src/assets/showcase/`) | ❌ | Designer-authored and versioned in-repo; held to the explicit standard by a test instead |

## Intentional deltas (keep)

| Delta | Designer behavior | Rationale |
|-------|-------------------|-----------|
| **`multiline` has no `spacing`** | Not in schema; flagged as an unknown key in the editor, stripped on import | Upstream `draw_multiline` never reads it — see [`multiline.spacing` is not accepted](#multilinespacing-is-not-accepted) |
| **Import normalization** | Missing `y`/`y_start` written as `0`; `multiline.spacing` dropped — both reported in a dismissible banner | See [Import normalization](#import-normalization--what-the-designer-writes-into-an-imported-payload). Forces imported payloads to be explicit rather than meaning one thing here and another on the device |
| **`multiline.parse_colors`** | Schema + renderer + UI | OEPL text parity; ODL tables omit it — keep until ODL adds or rejects |
| **Flow cursor (`ctx.pos_y`)** | Not implemented; a missing `y` renders at `0` | Maintainer ruling 2026-09-01 — see [The flow cursor](#the-flow-cursor-ctxpos_y--deliberate-non-goal). Poor fit for a fixed-size display, honoured by only 4 of the 20 handlers that advance it, and incompatible with per-element memoized rendering |
| **`diagram` element** | Not implemented | Undocumented in both upstreams — see [Unimplemented element: `diagram`](#unimplemented-element-diagram). Tracked, not proposed |
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
