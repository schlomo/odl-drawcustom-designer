import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { effectiveColorName, effectiveString, effectiveStrokeWidth } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult, SvgRectPrimitive } from './types'
import { isVisible } from './visibility'

type RectanglePatternElement = Extract<DrawElement, { type: 'rectangle_pattern' }>

function buildPatternRects(
  element: RectanglePatternElement,
  ctx: RenderContext,
): SvgRectPrimitive[] {
  const colorOptions = { accentMode: ctx.accentMode }
  const fill = mapColor(effectiveColorName(element, 'fill'), colorOptions)
  const stroke = mapColor(effectiveString(element, 'outline', 'black'), colorOptions) ?? undefined
  const strokeWidth = effectiveStrokeWidth(element, 'width', 1)
  const xStart = resolveX(element.x_start, ctx)
  const yStart = resolveY(element.y_start, ctx)
  const rects: SvgRectPrimitive[] = []

  for (let row = 0; row < element.y_repeat; row += 1) {
    for (let col = 0; col < element.x_repeat; col += 1) {
      rects.push({
        kind: 'rect',
        x: xStart + col * (element.x_size + element.x_offset),
        y: yStart + row * (element.y_size + element.y_offset),
        width: element.x_size,
        height: element.y_size,
        fill,
        stroke,
        strokeWidth,
      })
    }
  }

  return rects
}

export function renderRectanglePattern(
  element: RectanglePatternElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  return {
    layer: 'svg',
    primitive: {
      kind: 'rectangle-pattern-stub',
      rects: buildPatternRects(element, ctx),
    },
  }
}
