import type { DrawElement } from '../schema/elements'
import { resolveBounds } from './bounds'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type PlotElement = Extract<DrawElement, { type: 'plot' }>

export function renderPlot(element: PlotElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const bounds = resolveBounds(
    element.x_start ?? 0,
    element.x_end ?? ctx.width,
    element.y_start ?? 0,
    element.y_end ?? ctx.height,
    ctx,
  )

  return {
    layer: 'canvas',
    primitive: {
      kind: 'plot-stub',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      seriesCount: element.data.length,
    },
  }
}
