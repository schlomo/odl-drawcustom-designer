import type { DrawElement } from '../schema/elements'
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

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon-sequence-stub',
      x: resolveX(element.x, ctx),
      y: resolveY(element.y, ctx),
      size: element.size,
      icons: element.icons,
      direction: element.direction ?? 'right',
      spacing: element.spacing ?? element.size,
      fill: mapColor(element.fill ?? 'black', colorOptions) ?? '#000000',
    },
  }
}
