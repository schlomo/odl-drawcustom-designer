import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'

type ArcElement = Extract<DrawElement, { type: 'arc' }>

export function renderArc(element: ArcElement, ctx: RenderContext): RenderResult | null {
  const colorOptions = { accentMode: ctx.accentMode }

  return {
    layer: 'svg',
    primitive: {
      kind: 'arc',
      cx: resolveX(element.x, ctx),
      cy: resolveY(element.y, ctx),
      r: element.radius,
      startAngle: element.start_angle,
      endAngle: element.end_angle,
      fill: mapColor(element.fill ?? 'none', colorOptions),
      stroke: mapColor(element.outline ?? 'black', colorOptions) ?? undefined,
      strokeWidth: element.width ?? 1,
    },
  }
}
