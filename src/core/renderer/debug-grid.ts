import type { DrawElement } from '../schema/elements'
import { effectiveBool, effectiveNumber, effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY } from './fonts'
import { mapColor } from './colors'
import type { RenderContext, RenderResult } from './types'

type DebugGridElement = Extract<DrawElement, { type: 'debug_grid' }>

export function renderDebugGrid(
  element: DebugGridElement,
  ctx: RenderContext,
): RenderResult | null {
  const colorOptions = { accentMode: ctx.accentMode }

  return {
    layer: 'svg',
    primitive: {
      kind: 'debug-grid-stub',
      width: ctx.width,
      height: ctx.height,
      spacing: effectiveNumber(element, 'spacing', 20, 1),
      stroke: mapColor(effectiveString(element, 'line_color', 'black'), colorOptions) ?? '#000000',
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
            labelColor:
              mapColor(effectiveString(element, 'label_color', 'black'), colorOptions) ?? '#000000',
            labelFontSize: effectiveNumber(element, 'label_font_size', 12, 1),
            labelFontKey: effectiveString(element, 'font', DEFAULT_FONT_KEY),
          }
        : {}),
    },
  }
}
