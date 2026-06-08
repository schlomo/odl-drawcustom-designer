import type { DrawElement } from '../schema/elements'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import { effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, getFont } from './fonts'
import { layoutMultilineBlock, positionTextDrawLines } from './text-layout'
import { estimateMultilineBounds } from './text-metrics'
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

  const colorOptions = { accentMode: ctx.accentMode }
  const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
  const fontSize = effectiveFontSize(element, 'size', 20)
  const lineSpacing = effectiveNumber(element, 'spacing', 0)
  const lineTexts = element.value.split(element.delimiter)
  const font = getFont(fontKey)

  const layout = font
    ? layoutMultilineBlock(font, lineTexts, fontSize, lineSpacing)
    : null
  const { width, height } =
    layout ?? estimateMultilineBounds(lineTexts, fontSize, lineSpacing, fontKey)

  const x = resolveX(element.x, ctx)
  const y = element.y != null ? resolveY(element.y, ctx) : element.offset_y

  const drawLines =
    layout != null
      ? positionTextDrawLines(layout, x, y, 'lt', lineSpacing, 'lt')
      : lineTexts.map((text, index) => ({
          text,
          visualText: toVisualText(text),
          x: x + 2,
          y: y + fontSize + index * (fontSize + lineSpacing),
          width: estimateMultilineBounds([text], fontSize, 0, fontKey).width,
          direction: getDominantTextDirection(text),
        }))

  const primitive = {
    kind: 'multiline-stub' as const,
    x,
    y,
    width,
    height,
    lines: lineTexts,
    drawLines,
    color: mapColor(effectiveString(element, 'color', 'black'), colorOptions) ?? '#000000',
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
    ...(lineSpacing > 0 ? { lineSpacing } : {}),
  }

  return { layer: 'canvas', primitive }
}
