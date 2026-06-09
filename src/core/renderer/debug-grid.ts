import type { DrawElement } from '../schema/elements'
import { effectiveBool, effectiveNumber, effectiveString, resolveShapePaintFallback } from './element-defaults'
import { DEFAULT_FONT_KEY } from './fonts'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type DebugGridElement = Extract<DrawElement, { type: 'debug_grid' }>

export function renderDebugGrid(
  element: DebugGridElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)

  return {
    layer: 'svg',
    primitive: {
      kind: 'debug-grid-stub',
      width: ctx.width,
      height: ctx.height,
      spacing: effectiveNumber(element, 'spacing', 20, 1),
      stroke: resolveShapePaintFallback(element, 'line_color', paintOptions, 'black'),
      ...(effectiveBool(element, 'dashed')
        ? {
            dashed: true,
            dashLength: effectiveNumber(element, 'dash_length', 2, 0),
            spaceLength: effectiveNumber(element, 'space_length', 4, 0),
          }
        : {}),
      ...(effectiveBool(element, 'show_labels')
        ? {
            showLabels: true,
            labelStep: effectiveNumber(element, 'label_step', 40, 1),
            labelColor: resolveShapePaintFallback(element, 'label_color', paintOptions, 'black'),
            labelFontSize: effectiveNumber(element, 'label_font_size', 12, 1),
            labelFontKey: effectiveString(element, 'font', DEFAULT_FONT_KEY),
          }
        : {}),
    },
  }
}
