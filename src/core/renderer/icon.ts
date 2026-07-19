import type { DrawElement } from '../schema/elements'
import { ICON_DEFAULT_ANCHOR, resolveAnchoredBox } from './anchors'
import { effectiveFontSize, effectiveString, resolveIconPaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { resolveMdiPath } from './mdi-icons'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type IconElement = Extract<DrawElement, { type: 'icon' }>

export function renderIcon(element: IconElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const path = resolveMdiPath(element.value)
  if (path === null) {
    // Unknown icon name: don't pass a null path through to an invisible SVG
    // (issue #56). Throwing here hands off to safeRenderElement, which turns
    // this into the standard render-error placeholder + status banner naming
    // the element, matching the "clear error over wrong render" ruling used
    // for missing fonts (issue #53) and issue #10.
    throw new Error(`Unknown Material Design icon name: "${element.value}"`)
  }

  const paintOptions = paintOptionsFromContext(ctx)
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
      path,
      fill: resolveIconPaint(element, 'fill', 'black', paintOptions),
    },
  }
}
