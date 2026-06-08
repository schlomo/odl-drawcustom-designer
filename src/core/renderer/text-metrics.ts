import { DEFAULT_FONT_KEY, getFont } from './fonts'
import { layoutMultilineBlock, layoutTextBlock } from './text-layout'

/** Matches docs/spec/supported_types.md and propertyMetadata text.size default. */
const DEFAULT_FONT_SIZE = 20
const CHAR_WIDTH_RATIO = 0.55
const LINE_HEIGHT_RATIO = 1.2

function estimateFallback(value: string, fontSize: number): { width: number; height: number } {
  const width = Math.max(value.length * fontSize * CHAR_WIDTH_RATIO, fontSize * 0.5)
  const height = fontSize * LINE_HEIGHT_RATIO
  return { width, height }
}

/** Measure text bounds using opentype when the font is registered, else approximate. */
export function estimateTextBounds(
  value: string,
  fontSize: number = DEFAULT_FONT_SIZE,
  fontKey: string = DEFAULT_FONT_KEY,
): { width: number; height: number } {
  const font = getFont(fontKey)
  if (font) {
    const layout = layoutTextBlock(font, value, { fontSize })
    return { width: layout.width, height: layout.height }
  }
  return estimateFallback(value, fontSize)
}

export function estimateMultilineBounds(
  lines: string[],
  fontSize: number,
  lineSpacing: number = 0,
  fontKey: string = DEFAULT_FONT_KEY,
): { width: number; height: number } {
  if (lines.length === 0) {
    return { width: 0, height: 0 }
  }

  const font = getFont(fontKey)
  if (font) {
    const layout = layoutMultilineBlock(font, lines, fontSize, lineSpacing)
    return { width: layout.width, height: layout.height }
  }

  const lineHeight = fontSize * LINE_HEIGHT_RATIO
  const widths = lines.map((line) => estimateFallback(line, fontSize).width)
  const height = lines.length * lineHeight + Math.max(0, lines.length - 1) * lineSpacing

  return { width: Math.max(...widths), height }
}

export { DEFAULT_FONT_SIZE, CHAR_WIDTH_RATIO, LINE_HEIGHT_RATIO }
