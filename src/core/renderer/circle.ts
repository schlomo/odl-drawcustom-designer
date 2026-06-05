import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type CircleElement = Extract<DrawElement, { type: 'circle' }>

export function renderCircle(element: CircleElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }

  const primitive = {
    kind: 'circle' as const,
    cx: resolveX(element.x, ctx),
    cy: resolveY(element.y, ctx),
    r: element.radius,
    fill: mapColor(element.fill ?? null, colorOptions),
    stroke: mapColor(element.outline ?? 'black', colorOptions) ?? undefined,
    strokeWidth: element.width ?? 1,
  }

  return { layer: 'svg', primitive }
}
