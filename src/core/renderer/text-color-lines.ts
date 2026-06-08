import type opentype from 'opentype.js'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { parseColorMarkup } from './parse-colors'
import { measureTextWidth, type TextBlockLayout } from './text-layout'
import type { ColoredTextDrawSegment, TextDrawLine } from './types'
import type { TextColorSegment } from './parse-colors'
export type { TextColorSegment } from './parse-colors'

interface SegmentRange {
  start: number
  end: number
  color: string
}

function flattenSegments(segments: TextColorSegment[]): { text: string; ranges: SegmentRange[] } {
  let text = ''
  const ranges: SegmentRange[] = []

  for (const segment of segments) {
    ranges.push({
      start: text.length,
      end: text.length + segment.text.length,
      color: segment.color,
    })
    text += segment.text
  }

  return { text, ranges }
}

function sliceSegmentRanges(
  flattenedText: string,
  ranges: SegmentRange[],
  start: number,
  end: number,
): TextColorSegment[] {
  const segments: TextColorSegment[] = []

  for (const range of ranges) {
    if (range.end <= start || range.start >= end) {
      continue
    }

    const sliceStart = Math.max(range.start, start)
    const sliceEnd = Math.min(range.end, end)
    segments.push({
      text: flattenedText.slice(sliceStart, sliceEnd),
      color: range.color,
    })
  }

  return segments
}

function lineRangesInFlattened(flattened: string, layoutLines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let pos = 0

  for (let index = 0; index < layoutLines.length; index++) {
    const line = layoutLines[index]
    ranges.push([pos, pos + line.length])
    pos += line.length
    if (index < layoutLines.length - 1 && flattened[pos] === '\n') {
      pos += 1
    }
  }

  return ranges
}

export function buildColoredDrawLines(
  font: opentype.Font,
  value: string,
  defaultColor: string,
  parseColors: boolean,
  layout: TextBlockLayout,
  fontSize: number,
  boxX: number,
  boxY: number,
  anchor: string | undefined,
  lineSpacing: number,
  defaultAnchor: string,
): TextDrawLine[] {
  const segments = parseColors ? parseColorMarkup(value, defaultColor) : [{ text: value, color: defaultColor }]
  const { text: flattened, ranges } = flattenSegments(segments)
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  const horizontal = normalized[0] ?? 'l'

  const lineRanges = lineRangesInFlattened(
    flattened,
    layout.lines.map((line) => line.text),
  )

  return layout.lines.map((line, index) => {
    let lineX = boxX
    if (horizontal === 'm') {
      lineX = boxX + (layout.width - line.width) / 2
    } else if (horizontal === 'r') {
      lineX = boxX + layout.width - line.width
    }

    const baselineY =
      boxY + layout.metrics.ascender + index * (layout.metrics.lineHeight + lineSpacing)

    const [rangeStart, rangeEnd] = lineRanges[index] ?? [0, line.text.length]
    const lineSegments = parseColors
      ? sliceSegmentRanges(flattened, ranges, rangeStart, rangeEnd)
      : [{ text: line.text, color: defaultColor }]

    let segmentX = lineX
    const colorSegments: ColoredTextDrawSegment[] = lineSegments.map((segment) => {
      const entry: ColoredTextDrawSegment = {
        text: segment.text,
        visualText: toVisualText(segment.text),
        color: segment.color,
        x: segmentX,
      }
      segmentX += measureTextWidth(font, segment.text, fontSize)
      return entry
    })

    return {
      text: line.text,
      visualText: toVisualText(line.text),
      x: lineX,
      y: baselineY,
      width: line.width,
      direction: getDominantTextDirection(line.text),
      ...(parseColors ? { colorSegments } : {}),
    }
  })
}

export function buildColoredMultilineDrawLines(
  font: opentype.Font,
  lineTexts: string[],
  defaultColor: string,
  parseColors: boolean,
  fontSize: number,
  lineSpacing: number,
  startX: number,
  startY: number,
): TextDrawLine[] {
  const metricsAscender = font.ascender * (fontSize / font.unitsPerEm)
  const lineHeight = (font.ascender - font.descender) * (fontSize / font.unitsPerEm)

  return lineTexts.flatMap((lineText, index) => {
    const segments = parseColors
      ? parseColorMarkup(lineText, defaultColor)
      : [{ text: lineText, color: defaultColor }]
    const stripped = segments.map((segment) => segment.text).join('')
    const baselineY = startY + metricsAscender + index * (lineHeight + lineSpacing)
    let segmentX = startX + 2

    const colorSegments: ColoredTextDrawSegment[] = segments.map((segment) => {
      const entry: ColoredTextDrawSegment = {
        text: segment.text,
        visualText: toVisualText(segment.text),
        color: segment.color,
        x: segmentX,
      }
      segmentX += measureTextWidth(font, segment.text, fontSize)
      return entry
    })

    return [
      {
        text: stripped,
        visualText: toVisualText(stripped),
        x: startX + 2,
        y: baselineY,
        width: measureTextWidth(font, stripped, fontSize),
        direction: getDominantTextDirection(stripped),
        ...(parseColors ? { colorSegments } : {}),
      },
    ]
  })
}
