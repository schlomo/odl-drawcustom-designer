import type { DrawElement } from '../../core'

export const DEBUG_GRID_ONCE_MESSAGE =
  'This design already includes a debug grid — only one is allowed per design.'

export function hasDebugGrid(elements: readonly DrawElement[]): boolean {
  return elements.some((element) => element.type === 'debug_grid')
}

export function canAddElementType(
  elements: readonly DrawElement[],
  type: DrawElement['type'],
): boolean {
  if (type === 'debug_grid' && hasDebugGrid(elements)) {
    return false
  }
  return true
}

export type AddElementResult =
  | { ok: true; index: number }
  | { ok: false; message: string }

export function addElementResultMessage(result: AddElementResult): string | null {
  return result.ok ? null : result.message
}

/** New elements stack on top; debug grids belong behind everything else. */
export function elementsWithAddedElement(
  elements: readonly DrawElement[],
  element: DrawElement,
): { nextElements: DrawElement[]; index: number } {
  if (element.type === 'debug_grid') {
    return { nextElements: [element, ...elements], index: 0 }
  }
  return { nextElements: [...elements, element], index: elements.length }
}
