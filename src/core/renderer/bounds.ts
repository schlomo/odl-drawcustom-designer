import type { CoordinateInput } from './coordinates'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext } from './types'

export interface ResolvedBounds {
  x: number
  y: number
  width: number
  height: number
}

export function resolveBounds(
  xStart: CoordinateInput,
  xEnd: CoordinateInput,
  yStart: CoordinateInput,
  yEnd: CoordinateInput,
  ctx: RenderContext,
): ResolvedBounds {
  const x1 = resolveX(xStart, ctx)
  const x2 = resolveX(xEnd, ctx)
  const y1 = resolveY(yStart, ctx)
  const y2 = resolveY(yEnd, ctx)

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}
