import type { DrawElement } from '../schema/elements'
import { resolveAnchoredBox, TEXT_DEFAULT_ANCHOR } from './anchors'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { mapColor } from './colors'
import { resolveCoordinate, resolveX, resolveY } from './coordinates'
import { effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, getFont } from './fonts'
import { layoutTextBlock, positionTextDrawLines } from './text-layout'
import { estimateTextBounds } from './text-metrics'
import type { RenderContext, RenderResult } from './types'
import { isVisible, parseBool } from './visibility'

type TextElement = Extract<DrawElement, { type: 'text' }>

export function renderText(element: TextElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
  const fontSize = effectiveFontSize(element, 'size', 20)
  const font = getFont(fontKey)
  const maxWidth =
    element.max_width != null
      ? resolveCoordinate(element.max_width, ctx.width)
      : undefined
  const wraps = maxWidth != null && maxWidth > 0
  const lineSpacing = wraps ? effectiveNumber(element, 'spacing', 5) : 0

  const layout = font
    ? layoutTextBlock(font, element.value, {
        fontSize,
        maxWidth,
        lineSpacing,
        truncate: parseBool(element.truncate),
      })
    : null

  const { width, height } = layout ?? {
    ...estimateTextBounds(element.value, fontSize, fontKey),
  }
  const baselineOffset = layout?.metrics.baselineOffset ?? fontSize
  const anchorX = resolveX(element.x, ctx)
  const anchorY = resolveY(element.y ?? 0, ctx)
  const anchor = effectiveString(element, 'anchor', TEXT_DEFAULT_ANCHOR)
  const anchored = resolveAnchoredBox(
    anchor,
    anchorX,
    anchorY,
    width,
    height,
    TEXT_DEFAULT_ANCHOR,
    { baselineOffset },
  )

  const drawLines =
    layout != null
      ? positionTextDrawLines(layout, anchored.x, anchored.y, anchor, lineSpacing, TEXT_DEFAULT_ANCHOR)
      : [
          {
            text: element.value,
            visualText: toVisualText(element.value),
            x: anchorX,
            y: anchorY + baselineOffset,
            width,
            direction: getDominantTextDirection(element.value),
          },
        ]

  const primitive = {
    kind: 'text-stub' as const,
    x: anchored.x,
    y: anchored.y,
    width: anchored.width,
    height: anchored.height,
    anchorX,
    anchorY,
    anchor,
    value: element.value,
    drawLines,
    color: mapColor(effectiveString(element, 'color', 'black'), colorOptions) ?? '#000000',
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
    ...(wraps ? { lineSpacing } : {}),
  }

  return { layer: 'canvas', primitive }
}
