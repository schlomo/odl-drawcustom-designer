import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import type { RenderContext, RenderResult } from './types'

type PolygonElement = Extract<DrawElement, { type: 'polygon' }>

export function renderPolygon(element: PolygonElement, _ctx: RenderContext): RenderResult | null {
  const colorOptions = { accentMode: _ctx.accentMode }

  return {
    layer: 'svg',
    primitive: {
      kind: 'polygon',
      points: element.points,
      fill: mapColor(element.fill ?? 'none', colorOptions),
      stroke: mapColor(element.outline ?? 'black', colorOptions) ?? undefined,
      strokeWidth: element.width ?? 1,
    },
  }
}
