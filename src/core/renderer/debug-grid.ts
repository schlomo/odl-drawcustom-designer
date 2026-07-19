import type { DrawElement } from '../schema/elements'
import { effectiveBool, effectiveNumber, effectiveString, resolveShapePaintFallback } from './element-defaults'
import { DEFAULT_FONT_KEY, fontUnavailableMessage, getFont } from './fonts'
import { paintOptionsFromContext } from './preview-paint'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type DebugGridElement = Extract<DrawElement, { type: 'debug_grid' }>

/** Minimum spacing for debug grid lines — prevents pathological SVG line counts in the designer. */
export const DEBUG_GRID_MIN_SPACING = 8

export function renderDebugGrid(
  element: DebugGridElement,
  ctx: RenderContext,
): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const paintOptions = paintOptionsFromContext(ctx)
  const showLabels = effectiveBool(element, 'show_labels')

  if (showLabels) {
    // Unlike text/multiline, debug_grid never needed a real opentype.Font
    // object for its own layout — coordinate labels are painted via a CSS
    // font-family fallback at the UI layer, not opentype.js. A
    // confirmed-missing font was previously silently ignored: the whole
    // grid kept rendering fine, just with labels in a fallback font
    // (issue #53 follow-up, maintainer manual test). Only check when labels
    // are actually shown — the font is genuinely unused otherwise, and
    // spuriously erroring on an unrelated/unused key would be its own bug.
    const labelFontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
    if (!getFont(labelFontKey)) {
      const unavailableMessage = fontUnavailableMessage(labelFontKey)
      if (unavailableMessage) {
        throw new Error(unavailableMessage)
      }
    }
  }

  return {
    layer: 'svg',
    primitive: {
      kind: 'debug-grid-stub',
      width: ctx.width,
      height: ctx.height,
      spacing: effectiveNumber(element, 'spacing', 20, DEBUG_GRID_MIN_SPACING),
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
