import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible, parseBool } from './visibility'

type LineElement = Extract<DrawElement, { type: 'line' }>

export function renderLine(element: LineElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const stroke = mapColor(element.fill ?? 'black', colorOptions) ?? '#000000'

  const primitive = {
    kind: 'line' as const,
    x1: resolveX(element.x_start, ctx),
    y1: resolveY(element.y_start, ctx),
    x2: resolveX(element.x_end, ctx),
    y2: resolveY(element.y_end, ctx),
    stroke,
    strokeWidth: element.width ?? 1,
    ...(parseBool(element.dashed)
      ? {
          dashed: true,
          dashLength: element.dash_length,
          spaceLength: element.space_length,
        }
      : {}),
  }

  return { layer: 'svg', primitive }
}
