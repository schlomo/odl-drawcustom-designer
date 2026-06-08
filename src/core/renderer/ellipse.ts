import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { effectiveColorName, effectiveString, effectiveStrokeWidth } from './element-defaults'
import { resolveBounds } from './bounds'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type EllipseElement = Extract<DrawElement, { type: 'ellipse' }>

export function renderEllipse(element: EllipseElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const bounds = resolveBounds(element.x_start, element.x_end, element.y_start, element.y_end, ctx)

  return {
    layer: 'svg',
    primitive: {
      kind: 'ellipse',
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
      rx: bounds.width / 2,
      ry: bounds.height / 2,
      fill: mapColor(effectiveColorName(element, 'fill'), colorOptions),
      stroke: mapColor(effectiveString(element, 'outline', 'black'), colorOptions) ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
