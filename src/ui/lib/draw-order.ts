/**
 * Payload draw order per docs/spec/supported_types.md:
 * elements are painted first → last, so index 0 is back and the last index is front.
 */
export function isFrontElementIndex(index: number, elementCount: number): boolean {
  return elementCount > 0 && index === elementCount - 1
}

export function isBackElementIndex(index: number): boolean {
  return index === 0
}

/** Layer panel order: front (last drawn) at the top. */
export function layerPanelDisplayOrder<T>(items: readonly T[]): { item: T; index: number }[] {
  return items.map((item, index) => ({ item, index })).reverse()
}
