import type { DrawElement } from '../schema/elements'
import { effectiveNumber, effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type ArcElement = Extract<DrawElement, { type: 'arc' }>

export function renderArc(element: ArcElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)

  return {
    layer: 'svg',
    primitive: {
      kind: 'arc',
      cx: resolveX(element.x, ctx),
      cy: resolveY(element.y, ctx),
      r: effectiveNumber(element, 'radius', 1, 1),
      startAngle: effectiveNumber(element, 'start_angle', 0),
      endAngle: effectiveNumber(element, 'end_angle', 90),
      fill: resolveShapePaint(element, 'fill', paintOptions),
      stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
