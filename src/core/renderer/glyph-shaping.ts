import type opentype from 'opentype.js'

export interface ShapedGlyph {
  glyph: opentype.Glyph
  advanceWidth: number
}

export interface SimpleBoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface NaiveGlyphPosition {
  glyph: opentype.Glyph
  x: number
  y: number
}

const EMPTY_BOUNDING_BOX: SimpleBoundingBox = { x1: 0, y1: 0, x2: 0, y2: 0 }

/**
 * Maps text to glyphs via cmap only — one Unicode codepoint per glyph, no
 * OpenType Layout (GSUB/GPOS) shaping applied: no ligatures, no contextual
 * substitution, no kerning beyond the font's own stored per-glyph advance
 * width. Callers pass the resulting glyphs to `glyph.getPath()` without a
 * `font` argument, so variable-font instancing is never engaged either —
 * the glyf outline is used as-is, which is the font's default instance.
 *
 * This mirrors Home Assistant imagegen's Pillow rendering (ADR-007): a
 * plain raster text draw with no HarfBuzz/raqm shaping and no variable-font
 * axis handling.
 *
 * Used as a fallback when opentype.js's own shaping throws. Some real-world
 * fonts (e.g. Inter, in both its static and variable builds) use a GSUB
 * lookup type (chained contextual substitution, format 2) that opentype.js
 * 2.0.0 cannot parse — it throws for any 2+ character string passed through
 * `font.stringToGlyphs` / `forEachGlyph` / `getPath`, regardless of whether
 * the font is variable. See issue #10.
 */
export function shapeTextNaively(font: opentype.Font, text: string): ShapedGlyph[] {
  return Array.from(text).map((char) => {
    const glyph = font.charToGlyph(char)
    return { glyph, advanceWidth: glyph.advanceWidth ?? 0 }
  })
}

/** Sum of stored (un-shaped, un-kerned) advance widths, scaled to fontSize. */
export function measureNaiveAdvanceWidth(
  font: opentype.Font,
  text: string,
  fontSize: number,
): number {
  if (text.length === 0) {
    return 0
  }
  const scale = fontSize / font.unitsPerEm
  return shapeTextNaively(font, text).reduce(
    (sum, { advanceWidth }) => sum + advanceWidth * scale,
    0,
  )
}

/** Ink bounding box using naive (cmap-only, unshaped) glyph mapping. */
export function naiveTextBoundingBox(
  font: opentype.Font,
  text: string,
  fontSize: number,
): SimpleBoundingBox {
  if (text.length === 0) {
    return EMPTY_BOUNDING_BOX
  }

  const scale = fontSize / font.unitsPerEm
  let cursorX = 0
  let x1 = Number.POSITIVE_INFINITY
  let y1 = Number.POSITIVE_INFINITY
  let x2 = Number.NEGATIVE_INFINITY
  let y2 = Number.NEGATIVE_INFINITY

  for (const { glyph, advanceWidth } of shapeTextNaively(font, text)) {
    // No `font` argument — never engages variable-font instancing (see module docstring).
    const glyphBox = glyph.getPath(cursorX, 0, fontSize).getBoundingBox()
    x1 = Math.min(x1, glyphBox.x1)
    y1 = Math.min(y1, glyphBox.y1)
    x2 = Math.max(x2, glyphBox.x2)
    y2 = Math.max(y2, glyphBox.y2)
    cursorX += advanceWidth * scale
  }

  return Number.isFinite(x1) ? { x1, y1, x2, y2 } : EMPTY_BOUNDING_BOX
}

/** Glyph paint positions using naive (cmap-only, unshaped) glyph mapping. */
export function naiveGlyphPositions(
  font: opentype.Font,
  text: string,
  fontSize: number,
  lineX: number,
  baselineY: number,
): NaiveGlyphPosition[] {
  const scale = fontSize / font.unitsPerEm
  let cursorX = lineX
  const positions: NaiveGlyphPosition[] = []

  for (const { glyph, advanceWidth } of shapeTextNaively(font, text)) {
    positions.push({ glyph, x: cursorX, y: baselineY })
    cursorX += advanceWidth * scale
  }

  return positions
}

/**
 * Ink bounding box using the font's own OpenType shaping (ligatures,
 * contextual substitution, bidi feature application) via
 * `Font.prototype.forEachGlyph` — but, critically, each glyph's outline is
 * fetched with `glyph.getPath(x, y, fontSize)` **without** a `font`
 * argument, so `font.variation` is never consulted and variable-font
 * instancing is never engaged (mirrors the paint path in
 * `src/ui/lib/draw-canvas-stubs.ts`). For a variable font this renders the
 * default instance, matching Pillow's `ImageFont.truetype()` behavior when
 * no variation axes are set (see ADR-007 / issue #10).
 *
 * This is the primary path — full shaping is preserved for fonts that
 * support it. It still throws for fonts whose GSUB tables opentype.js
 * cannot parse (see `naiveTextBoundingBox`), so callers should fall back to
 * the naive helpers above on exception.
 */
export function shapedBoundingBoxNoVariation(
  font: opentype.Font,
  text: string,
  fontSize: number,
): SimpleBoundingBox {
  let x1 = Number.POSITIVE_INFINITY
  let y1 = Number.POSITIVE_INFINITY
  let x2 = Number.NEGATIVE_INFINITY
  let y2 = Number.NEGATIVE_INFINITY
  let any = false

  font.forEachGlyph(text, 0, 0, fontSize, {}, (glyph, glyphX, glyphY, glyphFontSize) => {
    const glyphBox = glyph.getPath(glyphX, glyphY, glyphFontSize).getBoundingBox()
    x1 = Math.min(x1, glyphBox.x1)
    y1 = Math.min(y1, glyphBox.y1)
    x2 = Math.max(x2, glyphBox.x2)
    y2 = Math.max(y2, glyphBox.y2)
    any = true
  })

  return any ? { x1, y1, x2, y2 } : EMPTY_BOUNDING_BOX
}
