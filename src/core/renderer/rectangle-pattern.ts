import type { DrawElement } from '../schema/elements'
import { effectiveNumber, effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult, SvgRectPrimitive } from './types'
import { isVisible } from './visibility'

type RectanglePatternElement = Extract<DrawElement, { type: 'rectangle_pattern' }>

function buildPatternRects(
  element: RectanglePatternElement,
  ctx: RenderContext,
): SvgRectPrimitive[] {
  const paintOptions = paintOptionsFromContext(ctx)
  const fill = resolveShapePaint(element, 'fill', paintOptions)
  const stroke = resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined
  const strokeWidth = effectiveStrokeWidth(element, 'width', 1)
  const xStart = resolveX(element.x_start, ctx)
  const yStart = resolveY(element.y_start, ctx)
  const xSize = effectiveNumber(element, 'x_size', 10, 1)
  const ySize = effectiveNumber(element, 'y_size', 10, 1)
  const xOffset = effectiveNumber(element, 'x_offset', 0, 0)
  const yOffset = effectiveNumber(element, 'y_offset', 0, 0)
  const xRepeat = effectiveNumber(element, 'x_repeat', 1, 1)
  const yRepeat = effectiveNumber(element, 'y_repeat', 1, 1)
  const rects: SvgRectPrimitive[] = []

  for (let row = 0; row < yRepeat; row += 1) {
    for (let col = 0; col < xRepeat; col += 1) {
      rects.push({
        kind: 'rect',
        x: xStart + col * (xSize + xOffset),
        y: yStart + row * (ySize + yOffset),
        width: xSize,
        height: ySize,
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
