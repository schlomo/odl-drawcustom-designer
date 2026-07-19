import type { DrawElement } from '../schema/elements'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { TEXT_DEFAULT_ANCHOR } from './anchors'
import { resolveCoordinate, resolveX, resolveY } from './coordinates'
import { effectiveBool, effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, fontUnavailableMessage, getFont } from './fonts'
import { stripColorMarkup } from './parse-colors'
import { buildColoredDrawLines } from './text-color-lines'
import { layoutTextBlock } from './text-layout'
import { positionTextBlockAtAnchor } from './text-ink-bounds'
import { estimateTextBounds } from './text-metrics'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type TextElement = Extract<DrawElement, { type: 'text' }>

export function renderText(element: TextElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const defaultColor = effectiveString(element, 'color', 'black')
  const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
  const fontSize = effectiveFontSize(element, 'size', 20)
  const font = getFont(fontKey)
  if (!font) {
    // No point falling back to estimated (wrong) metrics once the font is
    // confirmed unavailable — that's exactly the "plausible but wrong"
    // render the maintainer's ruling forbids (issue #53). Throwing here
    // routes through safeRenderElement's existing render-error placeholder
    // (issue #10/#51) instead of a second, bespoke error path. A font that's
    // merely still loading has no `fontUnavailableMessage` entry yet, so
    // this is a no-op for that case — see fonts.ts.
    const unavailableMessage = fontUnavailableMessage(fontKey)
    if (unavailableMessage) {
      throw new Error(unavailableMessage)
    }
  }
  const parseColors = effectiveBool(element, 'parse_colors')
  const layoutText = parseColors ? stripColorMarkup(element.value) : element.value
  const maxWidth =
    element.max_width != null
      ? resolveCoordinate(element.max_width, ctx.width)
      : undefined
  const wraps = maxWidth != null && maxWidth > 0
  const lineSpacing = wraps ? effectiveNumber(element, 'spacing', 5) : 0

  const layout = font
    ? layoutTextBlock(font, layoutText, {
        fontSize,
        maxWidth,
        lineSpacing,
        truncate: effectiveBool(element, 'truncate'),
      })
    : null

  const { width, height } = layout ?? {
    ...estimateTextBounds(layoutText, fontSize, fontKey),
  }
  const baselineOffset = layout?.metrics.baselineOffset ?? fontSize
  const anchorX = resolveX(element.x, ctx)
  const anchorY = resolveY(element.y ?? 0, ctx)
  const anchor = effectiveString(element, 'anchor', TEXT_DEFAULT_ANCHOR)

  const positioned =
    layout != null && font != null
      ? positionTextBlockAtAnchor(
          font,
          layout,
          fontSize,
          anchorX,
          anchorY,
          anchor,
          lineSpacing,
          TEXT_DEFAULT_ANCHOR,
        )
      : null

  const drawLines =
    layout != null && font != null
      ? parseColors
        ? buildColoredDrawLines(
            font,
            element.value,
            defaultColor,
            true,
            layout,
            fontSize,
            positioned!.drawLines,
          )
        : positioned!.drawLines
      : [
          {
            text: layoutText,
            visualText: toVisualText(layoutText),
            x: anchorX,
            y: anchorY + baselineOffset,
            width,
            direction: getDominantTextDirection(layoutText),
          },
        ]

  const bounds = positioned?.bounds ?? { x: anchorX, y: anchorY, width, height }

  const primitive = {
    kind: 'text-stub' as const,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    anchorX,
    anchorY,
    anchor,
    value: element.value,
    drawLines,
    color: defaultColor,
    defaultColor,
    parseColors,
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
    ...(wraps ? { lineSpacing } : {}),
  }

  return { layer: 'canvas', primitive }
}
