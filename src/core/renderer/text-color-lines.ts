import type opentype from 'opentype.js'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { parseColorMarkup, stripColorMarkup } from './parse-colors'
import { layoutMultilineBlock, measureTextWidth, type TextBlockLayout } from './text-layout'
import { positionTextBlockAtAnchor } from './text-ink-bounds'
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
  positionedLines: TextDrawLine[],
): TextDrawLine[] {
  const segments = parseColors ? parseColorMarkup(value, defaultColor) : [{ text: value, color: defaultColor }]
  const { text: flattened, ranges } = flattenSegments(segments)

  const lineRanges = lineRangesInFlattened(
    flattened,
    layout.lines.map((line) => line.text),
  )

  return positionedLines.map((positioned, index) => {
    const line = layout.lines[index]
    if (!line) {
      return positioned
    }

    const [rangeStart, rangeEnd] = lineRanges[index] ?? [0, line.text.length]
    const lineSegments = parseColors
      ? sliceSegmentRanges(flattened, ranges, rangeStart, rangeEnd)
      : [{ text: line.text, color: defaultColor }]

    let segmentX = positioned.x
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
      ...positioned,
      text: line.text,
      visualText: toVisualText(line.text),
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
  anchorX: number,
  anchorY: number,
): TextDrawLine[] {
  const layoutLineTexts = parseColors
    ? lineTexts.map((line) => stripColorMarkup(line))
    : lineTexts
  const layout = layoutMultilineBlock(font, layoutLineTexts, fontSize, lineSpacing)
  const positioned = positionTextBlockAtAnchor(
    font,
    layout,
    fontSize,
    anchorX,
    anchorY,
    'lt',
    lineSpacing,
    'lt',
  )

  return positioned.drawLines.flatMap((positionedLine, index) => {
    const lineText = lineTexts[index] ?? positionedLine.text
    const segments = parseColors
      ? parseColorMarkup(lineText, defaultColor)
      : [{ text: lineText, color: defaultColor }]
    const stripped = segments.map((segment) => segment.text).join('')

    let segmentX = positionedLine.x
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
        ...positionedLine,
        text: stripped,
        visualText: toVisualText(stripped),
        width: measureTextWidth(font, stripped, fontSize),
        direction: getDominantTextDirection(stripped),
        ...(parseColors ? { colorSegments } : {}),
      },
    ]
  })
}
