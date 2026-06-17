import type { DrawElement } from '../schema/elements'
import { getDominantTextDirection, toVisualText } from './bidi-text'
import { resolveX, resolveY } from './coordinates'
import { effectiveBool, effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, getFont } from './fonts'
import { stripColorMarkup } from './parse-colors'
import { buildColoredMultilineDrawLines } from './text-color-lines'
import { layoutMultilineBlock } from './text-layout'
import { positionTextBlockAtAnchor } from './text-ink-bounds'
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

  const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
  const fontSize = effectiveFontSize(element, 'size', 20)
  const lineSpacing = effectiveNumber(element, 'spacing', 0)
  const defaultColor = effectiveString(element, 'color', 'black')
  const parseColors = effectiveBool(element, 'parse_colors')
  const lineTexts = element.value.split(element.delimiter)
  const layoutLineTexts = parseColors
    ? lineTexts.map((line) => stripColorMarkup(line))
    : lineTexts
  const font = getFont(fontKey)

  const layout = font
    ? layoutMultilineBlock(font, layoutLineTexts, fontSize, lineSpacing)
    : null
  const { width, height } =
    layout ?? estimateMultilineBounds(layoutLineTexts, fontSize, lineSpacing, fontKey)

  const x = resolveX(element.x, ctx)
  const offsetY = effectiveNumber(element, 'offset_y', 0)
  const y = element.y != null ? resolveY(element.y, ctx) : offsetY

  const positioned =
    layout != null && font != null
      ? positionTextBlockAtAnchor(font, layout, fontSize, x, y, 'lt', lineSpacing, 'lt')
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
            lineSpacing,
            x,
            y,
          )
        : positioned!.drawLines
      : layoutLineTexts.map((text, index) => ({
          text,
          visualText: toVisualText(text),
          x: x + 2,
          y: y + fontSize + index * (fontSize + lineSpacing),
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
    ...(lineSpacing > 0 ? { lineSpacing } : {}),
  }

  return { layer: 'canvas', primitive }
}
