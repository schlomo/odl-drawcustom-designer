import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import type { RenderContext, RenderResult } from './types'
import { parseBool } from './visibility'

type DebugGridElement = Extract<DrawElement, { type: 'debug_grid' }>

const DEFAULT_SPACING = 10

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
      spacing: element.spacing ?? DEFAULT_SPACING,
      stroke: mapColor(element.line_color ?? 'black', colorOptions) ?? '#000000',
      ...(parseBool(element.dashed)
        ? {
            dashed: true,
            dashLength: element.dash_length,
            spaceLength: element.space_length,
          }
        : {}),
    },
  }
}
