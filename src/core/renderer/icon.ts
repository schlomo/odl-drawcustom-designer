import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type IconElement = Extract<DrawElement, { type: 'icon' }>

export function renderIcon(element: IconElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const fillColor = element.color ?? element.fill ?? 'black'

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon-stub',
      x: resolveX(element.x, ctx),
      y: resolveY(element.y, ctx),
      size: element.size,
      value: element.value,
      fill: mapColor(fillColor, colorOptions) ?? '#000000',
    },
  }
}
