import type opentype from 'opentype.js'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import type { AnchoredBox } from './anchors'
import {
  naiveTextBoundingBox,
  shapedBoundingBoxNoVariation,
  type SimpleBoundingBox,
} from './glyph-shaping'
import { getFontMetrics, type TextBlockLayout } from './text-layout'
import type { TextDrawLine } from './types'

export interface InkBoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
}

/**
 * Ink bounds via `font.forEachGlyph` + per-glyph `getPath()` without a
 * `font` argument (see `glyph-shaping.ts`) — preserves ligature/contextual
 * shaping while never engaging variable-font instancing (default instance,
 * matching Pillow — ADR-007 / issue #10). Falls back to a naive (cmap-only,
 * unshaped) glyph walk if the font's own shaping throws, which some
 * real-world fonts trigger regardless of variable-ness (a GSUB lookup type
 * opentype.js 2.0.0 cannot parse — see issue #10).
 */
function measureBoundingBox(font: opentype.Font, text: string, fontSize: number): SimpleBoundingBox {
  try {
    return shapedBoundingBoxNoVariation(font, text, fontSize)
  } catch {
    return naiveTextBoundingBox(font, text, fontSize)
  }
}

export function measureInkBoundingBox(
  font: opentype.Font,
  text: string,
  fontSize: number,
): InkBoundingBox {
  const visualText = toVisualText(text)
  if (visualText.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 }
  }

  const bbox = measureBoundingBox(font, visualText, fontSize)
  return {
    x1: bbox.x1,
    y1: bbox.y1,
    x2: bbox.x2,
    y2: bbox.y2,
    width: bbox.x2 - bbox.x1,
    height: bbox.y2 - bbox.y1,
  }
}

function parseAnchor(anchor: string | undefined, defaultAnchor: string): { horizontal: string; vertical: string } {
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  return {
    horizontal: normalized[0] ?? 'l',
    vertical: normalized[1] ?? 'a',
  }
}

/**
 * Baseline for ONE line drawn at `anchorY` with a Pillow single-line anchor —
 * the semantics of a bare `draw.text((x, y), line, anchor=...)` call, which is
 * how upstream `draw_multiline` positions every line (one call per line at its
 * own `current_y`).
 *
 * Measured against Pillow 12.3.0 (ppb.ttf @ 20, ascent 21 / descent 7) by
 * rendering each anchor and recovering the baseline. `a`/`m`/`s`/`d` are
 * FONT-METRIC — constant whatever the glyphs are — while `t`/`b` follow the
 * INK. `m` in particular is the middle of the ascent/descent box, NOT the
 * middle of the ink; treating it as ink-middle is what put our multiline
 * blocks a metric half-box below the device.
 *
 * Pillow reports descent as a positive number and opentype.js reports it
 * negative, so Pillow's `(ascent - descent) / 2` is our
 * `(ascender + descender) / 2`.
 */
export function baselineYForSingleLineAnchor(
  anchorY: number,
  vertical: string,
  ink: InkBoundingBox,
  metrics: ReturnType<typeof getFontMetrics>,
): number {
  switch (vertical) {
    case 'a':
      return anchorY + metrics.ascender
    case 't':
      return anchorY - ink.y1
    case 'm':
      return anchorY + (metrics.ascender + metrics.descender) / 2
    case 's':
      return anchorY
    case 'b':
      return anchorY - ink.y2
    case 'd':
      return anchorY + metrics.descender
    default:
      return anchorY + metrics.ascender
  }
}

function lineXForHorizontalAnchor(anchorX: number, horizontal: string, ink: InkBoundingBox): number {
  if (horizontal === 'm') {
    return anchorX - (ink.x1 + ink.x2) / 2
  }
  if (horizontal === 'r') {
    return anchorX - ink.x2
  }
  return anchorX - ink.x1
}

function baselineYForFirstLine(
  anchorY: number,
  vertical: string,
  firstInk: InkBoundingBox,
  metrics: ReturnType<typeof getFontMetrics>,
  blockTop: number,
  blockBottom: number,
): number {
  switch (vertical) {
    case 't':
      return anchorY - firstInk.y1
    case 'a':
      return anchorY + metrics.ascender
    case 's':
      return anchorY
    case 'm':
      return anchorY - (blockTop + blockBottom) / 2
    case 'b':
      return anchorY - blockBottom
    case 'd':
      return anchorY + metrics.descender
    default:
      return anchorY + metrics.ascender
  }
}

function baselineYForLastLine(
  anchorY: number,
  vertical: string,
  lastInk: InkBoundingBox,
  metrics: ReturnType<typeof getFontMetrics>,
  blockTop: number,
  blockBottom: number,
): number {
  switch (vertical) {
    case 't':
      return anchorY - blockTop
    case 'a':
      return anchorY + metrics.ascender
    case 's':
      return anchorY
    case 'm':
      return anchorY - (blockTop + blockBottom) / 2 + blockBottom - lastInk.y2
    case 'b':
      return anchorY - lastInk.y2
    case 'd':
      return anchorY + metrics.descender
    default:
      return anchorY - lastInk.y2
  }
}

/**
 * Position text lines using glyph ink bounds (Pillow `textbbox`) instead of font-table line metrics.
 */
export function positionTextBlockAtAnchor(
  font: opentype.Font,
  layout: TextBlockLayout,
  fontSize: number,
  anchorX: number,
  anchorY: number,
  anchor: string | undefined,
  lineSpacing: number,
  defaultAnchor: string,
): { drawLines: TextDrawLine[]; bounds: AnchoredBox } {
  const { horizontal, vertical } = parseAnchor(anchor, defaultAnchor)
  const metrics = layout.metrics
  const lineStep = metrics.lineHeight + lineSpacing
  const inks = layout.lines.map((line) => measureInkBoundingBox(font, line.text, fontSize))

  const relativeBaselines = layout.lines.map((_, index) => index * lineStep)
  const blockTop = Math.min(
    ...relativeBaselines.map((baseline, index) => baseline + (inks[index]?.y1 ?? 0)),
  )
  const blockBottom = Math.max(
    ...relativeBaselines.map((baseline, index) => baseline + (inks[index]?.y2 ?? 0)),
  )

  const firstInk = inks[0] ?? { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 }
  const lastInk = inks[inks.length - 1] ?? firstInk

  let firstBaselineY: number
  if (vertical === 'b' || vertical === 'd') {
    const lastIndex = layout.lines.length - 1
    const lastBaselineY = baselineYForLastLine(
      anchorY,
      vertical,
      lastInk,
      metrics,
      blockTop,
      blockBottom,
    )
    firstBaselineY = lastBaselineY - lastIndex * lineStep
  } else {
    firstBaselineY = baselineYForFirstLine(anchorY, vertical, firstInk, metrics, blockTop, blockBottom)
  }

  const drawLines = layout.lines.map((line, index) => {
    const ink = inks[index] ?? firstInk
    const baselineY = firstBaselineY + index * lineStep
    const lineX = lineXForHorizontalAnchor(anchorX, horizontal, ink)

    return {
      text: line.text,
      visualText: toVisualText(line.text),
      x: lineX,
      y: baselineY,
      width: line.width,
      direction: getDominantTextDirection(line.text),
    }
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let index = 0; index < drawLines.length; index += 1) {
    const line = drawLines[index]!
    const ink = inks[index] ?? firstInk
    minX = Math.min(minX, line.x + ink.x1)
    minY = Math.min(minY, line.y + ink.y1)
    maxX = Math.max(maxX, line.x + ink.x2)
    maxY = Math.max(maxY, line.y + ink.y2)
  }

  if (!Number.isFinite(minX)) {
    minX = anchorX
    minY = anchorY
    maxX = anchorX
    maxY = anchorY
  }

  return {
    drawLines,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
  }
}

/**
 * Position the lines of a `multiline` element exactly the way upstream
 * `draw_multiline` does (odl_renderer/elements/text.py):
 *
 *     for line in lines:
 *         draw.text((x, current_y), str(line), font=font, anchor=anchor, ...)
 *         current_y += offset_y
 *
 * Each line is an independent single-line `draw.text` at its own `current_y`,
 * so the anchor is applied PER LINE — not to the block as a whole the way
 * `positionTextBlockAtAnchor` does for a `\n`-wrapped `text` element. That
 * distinction is visible for the ink-following anchors (`t`, `b`) and for a
 * centering horizontal anchor, where every line is centred on `x` by its own
 * width rather than by the widest line's.
 *
 * `lineAdvance` is `offset_y`, the absolute per-line step (issue #169).
 */
export function positionMultilineLinesAtAnchor(
  font: opentype.Font,
  lineTexts: string[],
  fontSize: number,
  anchorX: number,
  anchorY: number,
  lineAdvance: number,
  anchor: string | undefined,
  defaultAnchor: string,
): { drawLines: TextDrawLine[]; bounds: AnchoredBox } {
  const { horizontal, vertical } = parseAnchor(anchor, defaultAnchor)
  const metrics = getFontMetrics(font, fontSize)
  const inks = lineTexts.map((text) => measureInkBoundingBox(font, text, fontSize))

  const drawLines = lineTexts.map((text, index) => {
    const ink = inks[index]!
    const lineOriginY = anchorY + index * lineAdvance

    return {
      text,
      visualText: toVisualText(text),
      x: lineXForHorizontalAnchor(anchorX, horizontal, ink),
      y: baselineYForSingleLineAnchor(lineOriginY, vertical, ink, metrics),
      width: ink.width,
      direction: getDominantTextDirection(text),
    }
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let index = 0; index < drawLines.length; index += 1) {
    const line = drawLines[index]!
    const ink = inks[index]!
    minX = Math.min(minX, line.x + ink.x1)
    minY = Math.min(minY, line.y + ink.y1)
    maxX = Math.max(maxX, line.x + ink.x2)
    maxY = Math.max(maxY, line.y + ink.y2)
  }

  if (!Number.isFinite(minX)) {
    minX = anchorX
    minY = anchorY
    maxX = anchorX
    maxY = anchorY
  }

  return {
    drawLines,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  }
}
