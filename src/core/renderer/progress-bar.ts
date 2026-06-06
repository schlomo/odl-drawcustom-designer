import type { DrawElement } from '../schema/elements'
import { resolveDirection } from './anchors'
import { mapColor } from './colors'
import { resolveBounds } from './bounds'
import type { RenderContext, RenderResult, SvgRectPrimitive } from './types'
import { isVisible, parseBool } from './visibility'

type ProgressBarElement = Extract<DrawElement, { type: 'progress_bar' }>

function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, progress))
}

function buildFillRect(
  bounds: { x: number; y: number; width: number; height: number },
  progress: number,
  direction: 'right' | 'left' | 'up' | 'down',
  fill: string | null,
): SvgRectPrimitive {
  const ratio = clampProgress(progress) / 100

  switch (direction) {
    case 'left':
      return {
        kind: 'rect',
        x: bounds.x + bounds.width * (1 - ratio),
        y: bounds.y,
        width: bounds.width * ratio,
        height: bounds.height,
        fill,
      }
    case 'up':
      return {
        kind: 'rect',
        x: bounds.x,
        y: bounds.y + bounds.height * (1 - ratio),
        width: bounds.width,
        height: bounds.height * ratio,
        fill,
      }
    case 'down':
      return {
        kind: 'rect',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height * ratio,
        fill,
      }
    case 'right':
    default:
      return {
        kind: 'rect',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width * ratio,
        height: bounds.height,
        fill,
      }
  }
}

export function renderProgressBar(
  element: ProgressBarElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const bounds = resolveBounds(element.x_start, element.x_end, element.y_start, element.y_end, ctx)
  const direction = resolveDirection(element.direction)
  const backgroundFill = mapColor(element.background ?? 'white', colorOptions)
  const progressFill = mapColor(element.fill ?? 'black', colorOptions)
  const stroke = mapColor(element.outline ?? 'black', colorOptions) ?? undefined
  const strokeWidth = element.width ?? 1

  const background: SvgRectPrimitive = {
    kind: 'rect',
    ...bounds,
    fill: backgroundFill,
    stroke,
    strokeWidth,
  }

  const fill = buildFillRect(bounds, element.progress, direction, progressFill)

  return {
    layer: 'svg',
    primitive: {
      kind: 'progress-bar-stub',
      background,
      fill,
      progress: element.progress,
      ...(element.show_percentage != null
        ? { showPercentage: parseBool(element.show_percentage) }
        : {}),
    },
  }
}
