const DEFAULT_FONT_SIZE = 12
const CHAR_WIDTH_RATIO = 0.55
const LINE_HEIGHT_RATIO = 1.2

/** Approximate text metrics until opentype.js integration (Phase 3). */
export function estimateTextBounds(
  value: string,
  fontSize: number = DEFAULT_FONT_SIZE,
): { width: number; height: number } {
  const width = Math.max(value.length * fontSize * CHAR_WIDTH_RATIO, fontSize * 0.5)
  const height = fontSize * LINE_HEIGHT_RATIO
  return { width, height }
}

export function estimateMultilineBounds(
  lines: string[],
  fontSize: number,
  lineSpacing: number = 0,
): { width: number; height: number } {
  if (lines.length === 0) {
    return { width: 0, height: 0 }
  }

  const lineHeight = fontSize * LINE_HEIGHT_RATIO
  const widths = lines.map((line) => estimateTextBounds(line, fontSize).width)
  const height = lines.length * lineHeight + Math.max(0, lines.length - 1) * lineSpacing

  return { width: Math.max(...widths), height }
}

export { DEFAULT_FONT_SIZE, CHAR_WIDTH_RATIO, LINE_HEIGHT_RATIO }
