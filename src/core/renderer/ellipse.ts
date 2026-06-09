import type { DrawElement } from '../schema/elements'
import { effectiveStrokeWidth, resolveShapePaint } from './element-defaults'
import { resolveBounds } from './bounds'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type EllipseElement = Extract<DrawElement, { type: 'ellipse' }>

export function renderEllipse(element: EllipseElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)
  const bounds = resolveBounds(element.x_start, element.x_end, element.y_start, element.y_end, ctx)

  return {
    layer: 'svg',
    primitive: {
      kind: 'ellipse',
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
      rx: bounds.width / 2,
      ry: bounds.height / 2,
      fill: resolveShapePaint(element, 'fill', paintOptions),
      stroke: resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined,
      strokeWidth: effectiveStrokeWidth(element, 'width', 1),
    },
  }
}
