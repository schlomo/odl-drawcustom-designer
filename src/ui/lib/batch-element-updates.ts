import type { DrawElement } from '../../core'
import { unionBounds } from './align-elements'
import { isElementDraggable, translateElement } from './element-geometry'
import type { ElementBounds } from './primitive-bounds'
import { snapMoveDelta } from './snap-to-grid'
import type { SnapGridPrefs } from '../preferences/snapGrid'

export function applyElementUpdates(
  elements: DrawElement[],
  updates: ReadonlyMap<number, DrawElement>,
): DrawElement[] {
  if (updates.size === 0) {
    return elements
  }
  const next = [...elements]
  for (const [index, element] of updates) {
    if (index >= 0 && index < next.length) {
      next[index] = element
    }
  }
  return next
}

export interface NudgeElementsOptions {
  canvas: { width: number; height: number }
  snapGrid?: SnapGridPrefs
  resolveBounds?: (element: DrawElement) => ElementBounds | null
}

export function nudgeElementsAtIndices(
  elements: DrawElement[],
  indices: readonly number[],
  dx: number,
  dy: number,
  options: NudgeElementsOptions,
): DrawElement[] {
  const { canvas, snapGrid, resolveBounds } = options
  const draggableIndices = indices.filter((index) => {
    if (index < 0 || index >= elements.length) {
      return false
    }
    return isElementDraggable(elements[index]!)
  })
  if (draggableIndices.length === 0) {
    return elements
  }

  let nudgeDx = dx
  let nudgeDy = dy
  if (snapGrid?.enabled && resolveBounds) {
    const boundsList = draggableIndices.flatMap((index) => {
      const bounds = resolveBounds(elements[index]!)
      return bounds ? [bounds] : []
    })
    const union = unionBounds(boundsList)
    if (union) {
      const snapped = snapMoveDelta(union, dx, dy, snapGrid.size, true, canvas)
      nudgeDx = snapped.dx
      nudgeDy = snapped.dy
    }
  }

  const next = [...elements]
  for (const index of draggableIndices) {
    next[index] = translateElement(elements[index]!, nudgeDx, nudgeDy, canvas)
  }
  return next
}
