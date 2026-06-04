# ADR-007: Hybrid SVG + Canvas rendering

## Status

Accepted

## Context

E-paper preview must render 16 draw types with accurate colors, fonts, dithering, and images. Some elements suit vector graphics; others need raster compositing.

## Decision

**Hybrid rendering pipeline:**

- **SVG layer** — lines, rectangles, polygons, circles, ellipses, arcs, icons (MDI paths), debug grid
- **Canvas layer** — opentype.js text, dlimg images, dither compositing, QR codes, plot lines

Rendering logic lives in `src/core/renderer/` with no React. Output feeds display and PNG export.

Color pipeline maps spec aliases (`accent`, halftone shortcuts, hex) to palette for preview; accent tag toggle simulates red vs yellow hardware.

## Consequences

- Renderer unit-tested against golden YAML fixtures
- opentype.js loads TTF from IndexedDB content map
- `@mdi/js` tree-shaken for full icon library
- Dither modes: ordered (d=2 default), optional Floyd-Steinberg (d=1)

## Alternatives considered

- **Canvas-only** — rejected; SVG simpler for shapes and icon paths
- **SVG-only** — rejected; text metrics, images, dither need canvas
