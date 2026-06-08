import type { DrawElement } from '../../core'
import { isElementDraggable, translateElement } from './element-geometry'

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

export function nudgeElementsAtIndices(
  elements: DrawElement[],
  indices: readonly number[],
  dx: number,
  dy: number,
  canvas: { width: number; height: number },
): DrawElement[] {
  const next = [...elements]
  for (const index of indices) {
    if (index < 0 || index >= next.length) {
      continue
    }
    const element = next[index]!
    if (!isElementDraggable(element)) {
      continue
    }
    next[index] = translateElement(element, dx, dy, canvas)
  }
  return next
}
