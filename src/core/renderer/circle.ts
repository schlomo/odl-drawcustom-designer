import type { DrawElement } from '../schema/elements'
import { effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type CircleElement = Extract<DrawElement, { type: 'circle' }>

export function renderCircle(element: CircleElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)

  const primitive = {
    kind: 'circle' as const,
    cx: resolveX(element.x, ctx),
    cy: resolveY(element.y, ctx),
    r: element.radius,
    fill: resolveShapePaint(element, 'fill', paintOptions),
    stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
    strokeWidth: effectiveStrokeWidth(element, 'width', 1),
  }

  return { layer: 'svg', primitive }
}
