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

These are tested in `tests/core/renderer/text-ink-bounds.test.ts` and `tests/core/renderer/text-anchor.test.ts`.

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

## Future direction (not yet implemented)

When font work stabilises, prefer a **single raster compositor** at tag resolution: all elements draw to one canvas with shared Pillow-equivalent rules, then one palette pass. SVG may remain for editor chrome (selection handles) but not for tag paint. Optional later step: golden PNG diff against upstream `odl-renderer` / Pillow for export.

## Alternatives considered

- **Canvas-only output** — deferred as full migration; best long-term match for HA. Shapes and MDI paths are portable to `Path2D` / integer draw calls.
- **SVG-only** — rejected; text metrics, images, dither need canvas
- **Hybrid SVG + Canvas (current)** — accepted for v1 velocity; amended to document HA parity cost on the SVG path
