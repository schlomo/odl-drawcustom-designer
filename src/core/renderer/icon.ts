import type { DrawElement } from '../schema/elements'
import { ICON_DEFAULT_ANCHOR, resolveAnchoredBox } from './anchors'
import { effectiveFontSize, effectiveString } from './element-defaults'
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
  const record = element as Record<string, unknown>
  const fillColor =
    record.color !== undefined
      ? effectiveString(element, 'color', 'black')
      : effectiveString(element, 'fill', 'black')
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
      kind: 'icon-stub',
      x: anchored.x,
      y: anchored.y,
      size,
      value: element.value,
      fill: mapColor(fillColor, colorOptions) ?? '#000000',
    },
  }
}
