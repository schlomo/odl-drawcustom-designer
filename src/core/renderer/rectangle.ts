import type { DrawElement } from '../schema/elements'
import { effectiveNumber, effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type RectangleElement = Extract<DrawElement, { type: 'rectangle' }>

export function renderRectangle(
  element: RectangleElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)
  const x1 = resolveX(element.x_start, ctx)
  const x2 = resolveX(element.x_end, ctx)
  const y1 = resolveY(element.y_start, ctx)
  const y2 = resolveY(element.y_end, ctx)

  const primitive = {
    kind: 'rect' as const,
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    fill: resolveShapePaint(element, 'fill', paintOptions),
    stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
    strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    ...(element.radius != null ? { radius: effectiveNumber(element, 'radius', 0, 0) } : {}),
  }

  return { layer: 'svg', primitive }
}
