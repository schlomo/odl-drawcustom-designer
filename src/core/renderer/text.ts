import type { DrawElement } from '../schema/elements'
import { resolveAnchoredBox, TEXT_DEFAULT_ANCHOR } from './anchors'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import { DEFAULT_FONT_SIZE, estimateTextBounds } from './text-metrics'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type TextElement = Extract<DrawElement, { type: 'text' }>

export function renderText(element: TextElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const fontSize = element.size ?? DEFAULT_FONT_SIZE
  const { width, height } = estimateTextBounds(element.value, fontSize)
  const anchorX = resolveX(element.x, ctx)
  const anchorY = resolveY(element.y ?? 0, ctx)
  const anchored = resolveAnchoredBox(
    element.anchor,
    anchorX,
    anchorY,
    width,
    height,
    TEXT_DEFAULT_ANCHOR,
    { baselineOffset: fontSize },
  )

  const primitive = {
    kind: 'text-stub' as const,
    x: anchored.x,
    y: anchored.y,
    width: anchored.width,
    height: anchored.height,
    anchorX,
    anchorY,
    anchor: element.anchor,
    value: element.value,
    color: mapColor(element.color ?? 'black', colorOptions) ?? '#000000',
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
  }

  return { layer: 'canvas', primitive }
}
