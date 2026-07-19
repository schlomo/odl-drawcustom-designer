# ADR-007: Hybrid SVG + Canvas rendering

## Status

Accepted (amended 2026-06-04)

## Context

E-paper preview must render 16 draw types with accurate colors, fonts, dithering, and images. Some elements suit vector graphics; others need raster compositing.

**Primary product goal:** preview and PNG export should **closely match Home Assistant / OEPL `imagegen` output** with reasonable effort. HA renders everything with Pillow to a single bitmap (integer pixels, hard edges for text via `fontmode = "1"`, no vector antialiasing). The tag only ever receives that raster.

## Decision

**Hybrid rendering pipeline (current implementation):**

- **SVG layer** — lines, rectangles, polygons, circles, ellipses, arcs, icons (MDI paths), debug grid
- **Canvas layer** — opentype.js text, dlimg images, dither compositing, QR codes, plot lines

Rendering logic lives in `src/core/renderer/` with no React. Output feeds display and PNG export.

Color pipeline maps spec aliases (`accent`, halftone shortcuts, hex) to palette for preview; accent tag toggle simulates red vs yellow hardware.

### HA fidelity rules (canvas path)

Text on the canvas path must follow Pillow semantics where we can approximate them in-browser:

- **Anchors** — use glyph **ink bounds** (`text-ink-bounds.ts`), not font-table ascender/descender alone, so `lb` / `mb` / `rb` align like Pillow `textbbox`.
- **Edges** — apply a hard-alpha canvas filter when filling opentype paths (`draw-canvas-stubs.ts`), approximating Pillow `fontmode = "1"`.
- **Variable fonts render at their default instance (matches Pillow)** — HA imagegen's Pillow rendering (`ImageFont.truetype()` used without `set_variation_by_axes`/`set_variation_by_name`) never touches variable-font axes. The designer matches this exactly: glyph outlines are fetched via `glyph.getPath()` **without** a `font` argument (`text-ink-bounds.ts`, `opentype-glyphs.ts` / `draw-canvas-stubs.ts`, see `glyph-shaping.ts`), so `opentype.js`'s `font.variation` instancing machinery is never engaged — the `glyf` table's stored outline (the font's default instance) is used as-is, regardless of whether the font is static or variable. This part of parity is unconditional; it does not depend on which shaping path below is taken.
- **Layout-engine shaping is a separate axis, and only partially matches Pillow** — the designer's *primary* text layout path prefers the font's own `forEachGlyph`-based feature application, which does apply GSUB (ligatures, contextual substitution) where `opentype.js` can parse the font's lookup tables. Pillow's own default (non-`raqm`) layout engine does **no** GSUB/GPOS at all, so on that primary path the designer can diverge from Pillow for ligature-capable fonts. Only when `forEachGlyph` **throws** does the designer fall back to a naive cmap-only glyph walk (`glyph-shaping.ts`) — some real-world fonts (e.g. Inter, static or variable) use a GSUB lookup type `opentype.js` 2.0.0 cannot parse, which throws for any 2+ character string (issue #10). That fallback happens to land closer to Pillow's basic layout (no shaping applied), but it is a side effect of the throw, not a deliberate emulation — a real HA install running `raqm`/HarfBuzz would shape such fonts and diverge from *both* of the designer's paths differently again (see the Consequences section below).

These are tested in `tests/core/renderer/text-ink-bounds.test.ts`, `tests/core/renderer/text-anchor.test.ts`, and `tests/core/renderer/variable-font-parity.test.ts`.

### SVG trade-offs (known parity gaps)

SVG was chosen for implementation speed on shapes and MDI icons, not because HA uses vectors. Browser SVG strokes and fills are **antialiased by default**. That diverges from Pillow on:

- 1px lines on coloured backgrounds (e.g. `fill: black` can rasterize as grey fringe or `#808080` after palette clamp in PNG export)
- Fine outline/detail vs flat tag palette

SVG elements also take an extra step at export: serialize → rasterize via `data:image/svg+xml` → composite on canvas → `finalizeTagImageData`. Canvas-drawn elements skip that conversion.

**Implication:** every HA parity fix on shapes may require **extra export/display handling** (e.g. `shape-rendering`, integer pixel alignment, or moving the primitive to canvas). Text parity fixes do not automatically carry over to SVG primitives.

## Consequences

- Renderer unit-tested against golden YAML fixtures
- opentype.js loads TTF from IndexedDB content map
- `@mdi/js` tree-shaken for full icon library
- Dither modes: ordered (d=2 default), optional Floyd-Steinberg (d=1)
- Text anchor and hard-edge behaviour are regression-tested; SVG shape parity is tracked separately
- **Known gap:** when a font's shaping throws (naive-fallback path, see above), ligatures/contextual substitution are lost for that font — this is closer to Pillow's own default (non-raqm) layout engine than to `opentype.js`'s normal ligature-shaped output, but a real HA install running with `raqm`/HarfBuzz could still diverge slightly for such fonts.

## Future direction (not yet implemented)

When font work stabilises, prefer a **single raster compositor** at tag resolution: all elements draw to one canvas with shared Pillow-equivalent rules, then one palette pass. SVG may remain for editor chrome (selection handles) but not for tag paint. Optional later step: golden PNG diff against upstream `odl-renderer` / Pillow for export.

## Alternatives considered

- **Canvas-only output** — deferred as full migration; best long-term match for HA. Shapes and MDI paths are portable to `Path2D` / integer draw calls.
- **SVG-only** — rejected; text metrics, images, dither need canvas
- **Hybrid SVG + Canvas (current)** — accepted for v1 velocity; amended to document HA parity cost on the SVG path
