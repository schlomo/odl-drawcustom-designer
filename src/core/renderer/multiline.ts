import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import { DEFAULT_FONT_SIZE, estimateMultilineBounds } from './text-metrics'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type MultilineElement = Extract<DrawElement, { type: 'multiline' }>

export function renderMultiline(
  element: MultilineElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const fontSize = element.size ?? DEFAULT_FONT_SIZE
  const lineSpacing = element.spacing ?? 0
  const lines = element.value.split(element.delimiter)
  const { width, height } = estimateMultilineBounds(lines, fontSize, lineSpacing)
  const y = element.y != null ? resolveY(element.y, ctx) : element.offset_y

  const primitive = {
    kind: 'multiline-stub' as const,
    x: resolveX(element.x, ctx),
    y,
    width,
    height,
    lines,
    color: mapColor(element.color ?? 'black', colorOptions) ?? '#000000',
    fontSize,
    ...(element.font != null ? { font: element.font } : {}),
    ...(lineSpacing > 0 ? { lineSpacing } : {}),
  }

  return { layer: 'canvas', primitive }
}
