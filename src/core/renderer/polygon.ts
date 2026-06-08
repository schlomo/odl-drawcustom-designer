import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { effectiveColorName, effectiveString, effectiveStrokeWidth } from './element-defaults'
import type { RenderContext, RenderResult } from './types'

type PolygonElement = Extract<DrawElement, { type: 'polygon' }>

export function renderPolygon(element: PolygonElement, _ctx: RenderContext): RenderResult | null {
  const colorOptions = { accentMode: _ctx.accentMode }

  return {
    layer: 'svg',
    primitive: {
      kind: 'polygon',
      points: element.points,
      fill: mapColor(effectiveColorName(element, 'fill'), colorOptions),
      stroke: mapColor(effectiveString(element, 'outline', 'black'), colorOptions) ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
