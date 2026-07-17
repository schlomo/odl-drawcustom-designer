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

/**
 * Selection-priority hit test (issue #36): a currently-selected element
 * should stay reachable for drag/resize even when a later-painted element
 * (e.g. a full-canvas background rectangle or the debug grid) occludes it —
 * elements paint in array order (ADR-007 parity with HA `imagegen`), so the
 * topmost-wins scan alone permanently locks out anything buried under a
 * full-canvas element.
 *
 * If the point falls within a *selected* element's bounds, that element wins
 * over plain stacking order — the topmost selected element, for multi-select.
 * Otherwise this is identical to {@link findTopmostElementHit}, so unselected
 * canvas behavior is unchanged.
 */
export function findSelectionPriorityHit(
  targets: readonly CanvasHitTarget[],
  point: { x: number; y: number },
  selectedIndices: readonly number[],
): CanvasHitTarget | null {
  if (selectedIndices.length > 0) {
    for (let i = targets.length - 1; i >= 0; i--) {
      const target = targets[i]
      if (
        target &&
        selectedIndices.includes(target.index) &&
        pointInBounds(point.x, point.y, target.bounds)
      ) {
        return target
      }
    }
  }
  return findTopmostElementHit(targets, point)
}
