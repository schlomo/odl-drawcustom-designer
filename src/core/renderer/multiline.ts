import type { DrawElement } from '../schema/elements'
import { MULTILINE_DEFAULT_ANCHOR } from './anchors'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { resolveX, resolveY } from './coordinates'
import { effectiveBool, effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, fontUnavailableMessage, getFont } from './fonts'
import { stripColorMarkup } from './parse-colors'
import { buildColoredMultilineDrawLines } from './text-color-lines'
import { getFontMetrics, layoutMultilineBlock } from './text-layout'
import { positionMultilineLinesAtAnchor } from './text-ink-bounds'
import { estimateMultilineBounds, LINE_HEIGHT_RATIO } from './text-metrics'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type MultilineElement = Extract<DrawElement, { type: 'multiline' }>

export function renderMultiline(
  element: MultilineElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
  const fontSize = effectiveFontSize(element, 'size', 20)
  const defaultColor = effectiveString(element, 'color', 'black')
  const parseColors = effectiveBool(element, 'parse_colors')
  const lineTexts = element.value.split(element.delimiter)
  const layoutLineTexts = parseColors
    ? lineTexts.map((line) => stripColorMarkup(line))
    : lineTexts
  const font = getFont(fontKey)
  if (!font) {
    // See renderText's identical check (text.ts) for the full rationale —
    // issue #53: a confirmed-unavailable font must never fall back to
    // estimated (wrong) metrics, only a still-loading one may.
    const unavailableMessage = fontUnavailableMessage(fontKey)
    if (unavailableMessage) {
      throw new Error(unavailableMessage)
    }
  }

  // Issue #169. Upstream `draw_multiline` (odl_renderer/elements/text.py)
  // advances `current_y += offset_y` after every line, so `offset_y` is the
  // per-line advance in absolute pixels. It never reads `spacing` at all —
  // that belongs to `draw_text`. This renderer had the two inverted.
  //
  // Our layout helpers take spacing ADDED to the font's natural line height
  // (`lineStep = metrics.lineHeight + lineSpacing`, text-ink-bounds.ts), so
  // convert the absolute advance into the additive form they expect. The
  // block height then works out to `lineHeight + (n - 1) * offset_y`, which
  // is exactly the span upstream paints.
  const lineAdvance = effectiveNumber(element, 'offset_y', 0)
  const naturalLineHeight = font
    ? getFontMetrics(font, fontSize).lineHeight
    : fontSize * LINE_HEIGHT_RATIO
  const lineSpacing = lineAdvance - naturalLineHeight

  const layout = font
    ? layoutMultilineBlock(font, layoutLineTexts, fontSize, lineSpacing)
    : null
  const { width, height } =
    layout ?? estimateMultilineBounds(layoutLineTexts, fontSize, lineSpacing, fontKey)

  const x = resolveX(element.x, ctx)
  // Upstream falls back to the document flow position (`ctx.pos_y +
  // y_padding`) when `y` is absent; this renderer has no flow-position
  // concept, so it starts at the top. Tracked as a separate parity gap in
  // docs/spec/odl-gap-report.md — `offset_y` is emphatically NOT the start,
  // which is what this used to assume.
  const y = element.y != null ? resolveY(element.y, ctx) : 0

  // Upstream draws each line with its own `draw.text` call at that line's
  // `current_y`, so the anchor is applied PER LINE — and its default here is
  // `lm`, not the `lt` a plain `text` element defaults to
  // (odl_renderer/elements/text.py: `anchor = element.get("anchor", "lm")`).
  // Anchoring the block as a whole, `lt`-style, hung multiline text a metric
  // half-box below where the device draws it.
  //
  // The `parse_colors` path is the one exception: upstream draws every
  // coloured segment with a hard-coded `anchor="lt"`, keeping only the
  // horizontal component of the element's anchor. Resolve that here so the
  // draw lines and the bounds below are anchored identically.
  const anchor = element.anchor ?? MULTILINE_DEFAULT_ANCHOR
  const effectiveAnchor = parseColors
    ? `${anchor.trim().toLowerCase()[0] ?? 'l'}t`
    : anchor

  const positioned =
    font != null
      ? positionMultilineLinesAtAnchor(
          font,
          layoutLineTexts,
          fontSize,
          x,
          y,
          lineAdvance,
          effectiveAnchor,
          MULTILINE_DEFAULT_ANCHOR,
        )
      : null

  const drawLines =
    layout != null && font != null
      ? parseColors
        ? buildColoredMultilineDrawLines(
            font,
            lineTexts,
            defaultColor,
            true,
            fontSize,
            lineAdvance,
            x,
            y,
            effectiveAnchor,
          )
        : positioned!.drawLines
      : layoutLineTexts.map((text, index) => ({
          text,
          visualText: toVisualText(text),
          x: x + 2,
          y: y + fontSize + index * lineAdvance,
          width: estimateMultilineBounds([text], fontSize, 0, fontKey).width,
          direction: getDominantTextDirection(text),
        }))

  const bounds = positioned?.bounds ?? { x, y, width, height }

  const primitive = {
    kind: 'multiline-stub' as const,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    lines: lineTexts,
    drawLines,
    color: defaultColor,
    defaultColor,
    parseColors,
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
  }

  return { layer: 'canvas', primitive }
}
