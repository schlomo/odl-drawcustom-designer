import type { DrawElement } from '../schema/elements'
import {
  ICON_DEFAULT_ANCHOR,
  iconSequenceBoxSize,
  resolveAnchoredBox,
  resolveDirection,
} from './anchors'
import { effectiveFontSize, effectiveNumber, effectiveString } from './element-defaults'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type IconSequenceElement = Extract<DrawElement, { type: 'icon_sequence' }>

export function renderIconSequence(
  element: IconSequenceElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const direction = resolveDirection(effectiveString(element, 'direction', 'right'))
  const size = effectiveFontSize(element, 'size', 20)
  const spacing = effectiveNumber(element, 'spacing', size / 4, 0)
  const { width, height } = iconSequenceBoxSize(size, element.icons.length, spacing, direction)
  const anchored = resolveAnchoredBox(
    effectiveString(element, 'anchor', ICON_DEFAULT_ANCHOR),
    resolveX(element.x, ctx),
    resolveY(element.y, ctx),
    width,
    height,
    ICON_DEFAULT_ANCHOR,
  )

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon-sequence-stub',
      x: anchored.x,
      y: anchored.y,
      size,
      icons: element.icons,
      direction,
      spacing,
      fill: mapColor(effectiveString(element, 'fill', 'black'), colorOptions) ?? '#000000',
    },
  }
}
