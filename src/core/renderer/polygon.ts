import type { DrawElement } from '../schema/elements'
import { effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'

type PolygonElement = Extract<DrawElement, { type: 'polygon' }>

export function renderPolygon(element: PolygonElement, ctx: RenderContext): RenderResult | null {
  const paintOptions = paintOptionsFromContext(ctx)

  return {
    layer: 'svg',
    primitive: {
      kind: 'polygon',
      points: element.points,
      fill: resolveShapePaint(element, 'fill', paintOptions),
      stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
