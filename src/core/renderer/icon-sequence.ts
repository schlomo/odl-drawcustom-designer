import type { DrawElement } from '../schema/elements'
import {
  ICON_SEQUENCE_ICONS_PREVIEW,
  resolveJsonFieldValue,
} from '../schema/propertyEditorMeta'
import {
  ICON_DEFAULT_ANCHOR,
  iconSequenceBoxSize,
  iconSequenceIconPositions,
  resolveAnchoredBox,
  resolveDirection,
} from './anchors'
import { effectiveFontSize, effectiveNumber, effectiveString, resolveIconPaint } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { resolveMdiPath } from './mdi-icons'
import { paintOptionsFromContext } from './preview-paint'
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

  const paintOptions = paintOptionsFromContext(ctx)
  const direction = resolveDirection(effectiveString(element, 'direction', 'right'))
  const size = effectiveFontSize(element, 'size', 20)
  const spacing = effectiveNumber(element, 'spacing', size / 4, 0)
  const icons = resolveJsonFieldValue(element.icons, [...ICON_SEQUENCE_ICONS_PREVIEW])
  const { width, height } = iconSequenceBoxSize(size, icons.length, spacing, direction)
  const anchored = resolveAnchoredBox(
    effectiveString(element, 'anchor', ICON_DEFAULT_ANCHOR),
    resolveX(element.x, ctx),
    resolveY(element.y, ctx),
    width,
    height,
    ICON_DEFAULT_ANCHOR,
  )
  const positions = iconSequenceIconPositions(
    anchored.x,
    anchored.y,
    size,
    icons.length,
    spacing,
    direction,
  )

  return {
    layer: 'svg',
    primitive: {
      kind: 'icon_sequence',
      x: anchored.x,
      y: anchored.y,
      size,
      direction,
      spacing,
      fill: resolveIconPaint(element, 'fill', 'black', paintOptions),
      icons: icons.map((name, index) => ({
        name,
        path: resolveMdiPath(name),
        x: positions[index]!.x,
        y: positions[index]!.y,
      })),
    },
  }
}
