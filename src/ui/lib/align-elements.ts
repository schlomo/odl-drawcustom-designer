import { elementGeometryLocked, type DrawElement } from '../../core'
import { translateElement, type TranslateCanvasDefaults } from './element-geometry'
import type { ElementBounds } from './primitive-bounds'

export type HorizontalAlign = 'left' | 'center' | 'right'
export type VerticalAlign = 'top' | 'middle' | 'bottom'
export type ElementAlign = HorizontalAlign | VerticalAlign

/** True when any selected element has templated geometry — canvas align must not run. */
export function selectionIncludesGeometryLocked(
  elements: readonly DrawElement[],
  indices: readonly number[],
): boolean {
  return indices.some((index) => {
    const element = elements[index]
    return element != null && elementGeometryLocked(element)
  })
}

export function canAlignSelection(
  elements: readonly DrawElement[],
  indices: readonly number[],
): boolean {
  return indices.length >= 2 && !selectionIncludesGeometryLocked(elements, indices)
}

export function unionBounds(all: ElementBounds[]): ElementBounds | null {
  if (all.length === 0) {
    return null
  }

  const minX = Math.min(...all.map((bounds) => bounds.x))
  const minY = Math.min(...all.map((bounds) => bounds.y))
  const maxX = Math.max(...all.map((bounds) => bounds.x + bounds.width))
  const maxY = Math.max(...all.map((bounds) => bounds.y + bounds.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function alignDelta(
  bounds: ElementBounds,
  target: ElementBounds,
  align: ElementAlign,
): { dx: number; dy: number } {
  switch (align) {
    case 'left':
      return { dx: target.x - bounds.x, dy: 0 }
    case 'center':
      return {
        dx: target.x + target.width / 2 - (bounds.x + bounds.width / 2),
        dy: 0,
      }
    case 'right':
      return { dx: target.x + target.width - (bounds.x + bounds.width), dy: 0 }
    case 'top':
      return { dx: 0, dy: target.y - bounds.y }
    case 'middle':
      return {
        dx: 0,
        dy: target.y + target.height / 2 - (bounds.y + bounds.height / 2),
      }
    case 'bottom':
      return { dx: 0, dy: target.y + target.height - (bounds.y + bounds.height) }
  }
}

export function alignElementsInUnion(
  elements: DrawElement[],
  indices: number[],
  boundsByIndex: Map<number, ElementBounds>,
  align: ElementAlign,
  canvas: TranslateCanvasDefaults,
): DrawElement[] {
  if (selectionIncludesGeometryLocked(elements, indices)) {
    return elements
  }

  const boundsList = indices
    .map((index) => boundsByIndex.get(index))
    .filter((bounds): bounds is ElementBounds => bounds != null)
  const target = unionBounds(boundsList)
  if (!target) {
    return elements
  }

  const next = [...elements]
  for (const index of indices) {
    const bounds = boundsByIndex.get(index)
    if (!bounds) {
      continue
    }
    const { dx, dy } = alignDelta(bounds, target, align)
    if (dx === 0 && dy === 0) {
      continue
    }
    next[index] = translateElement(elements[index]!, dx, dy, canvas)
  }
  return next
}
