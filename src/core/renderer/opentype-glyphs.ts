import type opentype from 'opentype.js'
import { toVisualText } from './bidi-text'
import { naiveGlyphPositions } from './glyph-shaping'

export interface OpentypeGlyphPosition {
  glyph: opentype.Glyph
  x: number
  y: number
}

/**
 * Glyph positions for painting (`src/ui/lib/draw-canvas-stubs.ts` calls
 * `glyph.getPath(x, y, fontSize)` on each one without a `font` argument, so
 * variable-font instancing is never engaged here — matches the ink-bounds
 * path in `text-ink-bounds.ts`, see `glyph-shaping.ts`). Uses the font's own
 * OpenType shaping via `forEachGlyph`; falls back to a naive (cmap-only,
 * unshaped) glyph walk if that throws — some real-world fonts (e.g. Inter)
 * use a GSUB lookup type opentype.js 2.0.0 cannot parse, regardless of
 * whether the font is variable (issue #10).
 */
export function computeOpentypeGlyphPositions(
  font: opentype.Font,
  text: string,
  fontSize: number,
  lineX: number,
  baselineY: number,
): OpentypeGlyphPosition[] {
  const visualText = toVisualText(text)

  try {
    const positions: OpentypeGlyphPosition[] = []
    font.forEachGlyph(visualText, 0, 0, fontSize, {}, (glyph, ltrX) => {
      positions.push({ glyph, x: lineX + ltrX, y: baselineY })
    })
    return positions
  } catch {
    return naiveGlyphPositions(font, visualText, fontSize, lineX, baselineY)
  }
}
