import { pointInBounds, type ElementBounds } from './primitive-bounds'

export interface CanvasHitTarget {
  index: number
  bounds: ElementBounds
}

/** Front-to-back hit test (last YAML item wins). */
export function findTopmostElementHit(
  targets: readonly CanvasHitTarget[],
  point: { x: number; y: number },
): CanvasHitTarget | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i]
    if (target && pointInBounds(point.x, point.y, target.bounds)) {
      return target
    }
  }
  return null
}
