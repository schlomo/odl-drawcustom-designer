import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import { effectiveBool, effectiveNumber, effectiveString, effectiveStrokeWidth } from './element-defaults'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type LineElement = Extract<DrawElement, { type: 'line' }>

export function renderLine(element: LineElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const stroke = mapColor(effectiveString(element, 'fill', 'black'), colorOptions) ?? '#000000'

  const primitive = {
    kind: 'line' as const,
    x1: resolveX(element.x_start, ctx),
    y1: resolveY(element.y_start, ctx),
    x2: resolveX(element.x_end, ctx),
    y2: resolveY(element.y_end, ctx),
    stroke,
    strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    ...(effectiveBool(element, 'dashed')
      ? {
          dashed: true,
          dashLength: effectiveNumber(element, 'dash_length', 5, 0),
          spaceLength: effectiveNumber(element, 'space_length', 3, 0),
        }
      : {}),
  }

  return { layer: 'svg', primitive }
}
