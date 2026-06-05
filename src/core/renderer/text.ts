import type { DrawElement } from '../schema/elements'
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

  const primitive = {
    kind: 'text-stub' as const,
    x: resolveX(element.x, ctx),
    y: resolveY(element.y, ctx),
    width,
    height,
    value: element.value,
    color: mapColor(element.color ?? 'black', colorOptions) ?? '#000000',
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
  }

  return { layer: 'canvas', primitive }
}
