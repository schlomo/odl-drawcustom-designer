import type opentype from 'opentype.js'
import { getFont } from './fonts'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import type { TextDrawLine } from './types'

export interface FontMetrics {
  ascender: number
  descender: number
  lineHeight: number
  baselineOffset: number
}

export interface LayoutLine {
  text: string
  width: number
}

export interface TextBlockLayout {
  lines: LayoutLine[]
  width: number
  height: number
  metrics: FontMetrics
}

export interface LayoutTextOptions {
  fontSize: number
  maxWidth?: number
  lineSpacing?: number
  truncate?: boolean
}

const ELLIPSIS = '...'

export function getFontMetrics(font: opentype.Font, fontSize: number): FontMetrics {
  const scale = fontSize / font.unitsPerEm
  const ascender = font.ascender * scale
  const descender = font.descender * scale
  const lineHeight = ascender - descender

  return {
    ascender,
    descender,
    lineHeight,
    baselineOffset: ascender,
  }
}

export function measureTextWidth(font: opentype.Font, text: string, fontSize: number): number {
  if (text.length === 0) {
    return 0
  }
  return font.getAdvanceWidth(text, fontSize)
}

function truncateToWidth(
  font: opentype.Font,
  text: string,
  fontSize: number,
  maxWidth: number,
): string {
  if (measureTextWidth(font, text, fontSize) <= maxWidth) {
    return text
  }

  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid)}${ELLIPSIS}`
    if (measureTextWidth(font, candidate, fontSize) <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return `${text.slice(0, lo)}${ELLIPSIS}`
}

function breakLongWord(
  font: opentype.Font,
  word: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ''

  for (const char of word) {
    const next = current + char
    if (measureTextWidth(font, next, fontSize) <= maxWidth || current.length === 0) {
      current = next
    } else {
      lines.push(current)
      current = char
    }
  }

  if (current.length > 0) {
    lines.push(current)
  }

  return lines
}

export function wrapTextLines(
  font: opentype.Font,
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) {
    return ['']
  }

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const wordWidth = measureTextWidth(font, word, fontSize)
    if (wordWidth > maxWidth) {
      if (current.length > 0) {
        lines.push(current)
        current = ''
      }
      lines.push(...breakLongWord(font, word, fontSize, maxWidth))
      continue
    }

    const candidate = current.length > 0 ? `${current} ${word}` : word
    if (measureTextWidth(font, candidate, fontSize) <= maxWidth) {
      current = candidate
    } else {
      if (current.length > 0) {
        lines.push(current)
      }
      current = word
    }
  }

  if (current.length > 0) {
    lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

export function layoutTextBlock(
  font: opentype.Font,
  text: string,
  options: LayoutTextOptions,
): TextBlockLayout {
  const metrics = getFontMetrics(font, options.fontSize)
  const lineSpacing = options.lineSpacing ?? 0
  let lineTexts: string[]

  if (options.maxWidth != null && options.maxWidth > 0) {
    if (options.truncate) {
      lineTexts = [truncateToWidth(font, text, options.fontSize, options.maxWidth)]
    } else {
      lineTexts = wrapTextLines(font, text, options.fontSize, options.maxWidth)
    }
  } else if (text.includes('\n')) {
    lineTexts = text.split('\n')
  } else {
    lineTexts = [text]
  }

  const lines = lineTexts.map((lineText) => ({
    text: lineText,
    width: measureTextWidth(font, lineText, options.fontSize),
  }))
  const width = lines.reduce((max, line) => Math.max(max, line.width), 0)
  const height =
    lines.length === 0
      ? 0
      : metrics.lineHeight * lines.length + Math.max(0, lines.length - 1) * lineSpacing

  return { lines, width, height, metrics }
}

export function layoutMultilineBlock(
  font: opentype.Font,
  lineTexts: string[],
  fontSize: number,
  lineSpacing: number,
): TextBlockLayout {
  const metrics = getFontMetrics(font, fontSize)
  const lines = lineTexts.map((lineText) => ({
    text: lineText,
    width: measureTextWidth(font, lineText, fontSize),
  }))
  const width = lines.reduce((max, line) => Math.max(max, line.width), 0)
  const height =
    lines.length === 0
      ? 0
      : metrics.lineHeight * lines.length + Math.max(0, lines.length - 1) * lineSpacing

  return { lines, width, height, metrics }
}

export function positionTextDrawLines(
  layout: TextBlockLayout,
  boxX: number,
  boxY: number,
  anchor: string | undefined,
  lineSpacing: number,
  defaultAnchor: string,
): TextDrawLine[] {
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  const horizontal = normalized[0] ?? 'l'

  return layout.lines.map((line, index) => {
    let lineX = boxX
    if (horizontal === 'm') {
      lineX = boxX + (layout.width - line.width) / 2
    } else if (horizontal === 'r') {
      lineX = boxX + layout.width - line.width
    }

    const baselineY =
      boxY + layout.metrics.ascender + index * (layout.metrics.lineHeight + lineSpacing)

    return {
      text: line.text,
      visualText: toVisualText(line.text),
      x: lineX,
      y: baselineY,
      width: line.width,
      direction: getDominantTextDirection(line.text),
    }
  })
}

export function layoutTextWithFont(
  text: string,
  options: LayoutTextOptions & { fontKey?: string },
): TextBlockLayout | null {
  const font = getFont(options.fontKey)
  if (!font) {
    return null
  }
  return layoutTextBlock(font, text, options)
}
