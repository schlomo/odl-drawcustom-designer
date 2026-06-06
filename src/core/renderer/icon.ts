import type { DrawElement } from '../schema/elements'
import { ICON_DEFAULT_ANCHOR, resolveAnchoredBox, resolveNumericSize } from './anchors'
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
  const size = resolveNumericSize(element.size)
  const anchored = resolveAnchoredBox(
    element.anchor,
    resolveX(element.x, ctx),
    resolveY(element.y, ctx),
    size,
    size,
    ICON_DEFAULT_ANCHOR,
  )

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon-stub',
      x: anchored.x,
      y: anchored.y,
      size,
      value: element.value,
      fill: mapColor(fillColor, colorOptions) ?? '#000000',
    },
  }
}
