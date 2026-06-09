import type { DrawElement } from '../schema/elements'
import { resolveDirection } from './anchors'
import { resolveBounds } from './bounds'
import { effectiveBool, effectiveProgress, effectiveString, effectiveStrokeWidth, resolveShapePaint, resolveShapePaintFallback } from './element-defaults'
import { DEFAULT_FONT_KEY } from './fonts'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult, SvgRectPrimitive } from './types'
import { isVisible } from './visibility'

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

  const paintOptions = paintOptionsFromContext(ctx)
  const bounds = resolveBounds(element.x_start, element.x_end, element.y_start, element.y_end, ctx)
  const direction = resolveDirection(effectiveString(element, 'direction', 'right'))
  const backgroundFill = resolveShapePaint(element, 'background', paintOptions, 'white')
  const progressFill = resolveShapePaint(element, 'fill', paintOptions, 'red')
  const stroke = resolveShapePaint(element, 'outline', paintOptions, 'black') ?? undefined
  const strokeWidth = effectiveStrokeWidth(element, 'width', 1)

  const background: SvgRectPrimitive = {
    kind: 'rect',
    ...bounds,
    fill: backgroundFill,
    stroke,
    strokeWidth,
  }

  const fill = buildFillRect(bounds, effectiveProgress(element, 'progress'), direction, progressFill)

  return {
    layer: 'svg',
    primitive: {
      kind: 'progress-bar-stub',
      background,
      fill,
      progress: effectiveProgress(element, 'progress'),
      ...(effectiveBool(element, 'show_percentage')
        ? {
            showPercentage: true,
            percentageColor: resolveShapePaintFallback(
              element,
              'outline',
              paintOptions,
              'black',
            ),
            percentageFontSize: Math.max(8, Math.round(bounds.height * 0.55)),
            percentageFontKey: effectiveString(element, 'font', DEFAULT_FONT_KEY),
          }
        : {}),
    },
  }
}
