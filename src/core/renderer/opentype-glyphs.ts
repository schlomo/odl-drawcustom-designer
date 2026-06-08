import type opentype from 'opentype.js'
import { toVisualText } from './bidi-text'

export interface OpentypeGlyphPosition {
  glyph: opentype.Glyph
  x: number
  y: number
}

export function computeOpentypeGlyphPositions(
  font: opentype.Font,
  text: string,
  fontSize: number,
  lineX: number,
  baselineY: number,
): OpentypeGlyphPosition[] {
  const visualText = toVisualText(text)
  const positions: OpentypeGlyphPosition[] = []

  font.forEachGlyph(visualText, 0, 0, fontSize, {}, (glyph, ltrX) => {
    positions.push({ glyph, x: lineX + ltrX, y: baselineY })
  })

  return positions
}
