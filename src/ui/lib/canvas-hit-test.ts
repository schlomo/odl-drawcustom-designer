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

function boundsArea(bounds: ElementBounds): number {
  return bounds.width * bounds.height
}

/**
 * Selection-priority hit test (issue #36, refined by issue #45's maintainer
 * ruling): a currently-selected element should stay reachable for
 * drag/resize even when a later-painted element (e.g. a full-canvas
 * background rectangle or the debug grid) occludes it — elements paint in
 * array order (ADR-007 parity with HA `imagegen`), so the topmost-wins scan
 * alone can permanently lock out anything buried under a full-canvas
 * element.
 *
 * Priority applies to a selected element only when BOTH hold (#45 ruling:
 * options 1+3 implemented, option 2's canvas-size heuristic rejected):
 *   1. it is draggable — `isDraggable` is keyed by index rather than taking
 *      the element itself, so this module keeps its current dependency
 *      shape (bounds/index only) instead of importing the element domain
 *      model from element-geometry/core; and
 *   2. it is occluded at the click point by the topmost candidate there,
 *      and that candidate's bounds area is >= its own — priority digs DOWN
 *      to buried elements, never UP: an element larger than whatever is
 *      drawn on top of it never captures the click via priority. This is
 *      what fixes the lockout where a selected full-canvas element (e.g.
 *      debug_grid) claimed every pointer-down even when a smaller element
 *      was painted on top of it.
 *
 * When no selected element qualifies, this is identical to
 * {@link findTopmostElementHit}, so unselected canvas behavior is
 * unchanged.
 */
export function findSelectionPriorityHit(
  targets: readonly CanvasHitTarget[],
  point: { x: number; y: number },
  selectedIndices: readonly number[],
  isDraggable: (index: number) => boolean = () => true,
): CanvasHitTarget | null {
  if (selectedIndices.length > 0) {
    const topmost = findTopmostElementHit(targets, point)
    if (topmost) {
      const topmostArea = boundsArea(topmost.bounds)
      for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i]
        if (
          target &&
          selectedIndices.includes(target.index) &&
          pointInBounds(point.x, point.y, target.bounds) &&
          isDraggable(target.index) &&
          topmostArea >= boundsArea(target.bounds)
        ) {
          return target
        }
      }
    }
  }
  return findTopmostElementHit(targets, point)
}
