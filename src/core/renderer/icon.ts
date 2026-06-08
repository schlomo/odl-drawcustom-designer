import type { DrawElement } from '../schema/elements'
import { ICON_DEFAULT_ANCHOR, resolveAnchoredBox } from './anchors'
import { effectiveFontSize, effectiveString, resolveIconFillColor } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { resolveMdiPath } from './mdi-icons'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type IconElement = Extract<DrawElement, { type: 'icon' }>

export function renderIcon(element: IconElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const size = effectiveFontSize(element, 'size', 20)
  const anchored = resolveAnchoredBox(
    effectiveString(element, 'anchor', ICON_DEFAULT_ANCHOR),
    resolveX(element.x, ctx),
    resolveY(element.y, ctx),
    size,
    size,
    ICON_DEFAULT_ANCHOR,
  )

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon',
      x: anchored.x,
      y: anchored.y,
      size,
      value: element.value,
      path: resolveMdiPath(element.value),
      fill: resolveIconFillColor(element, 'fill', 'black', colorOptions),
    },
  }
}
