/** Remap selection index after moving one element in the array. */
export function remapIndexAfterMove(
  selectedIndex: number | null,
  fromIndex: number,
  toIndex: number,
): number | null {
  if (selectedIndex == null) {
    return null
  }
  if (selectedIndex === fromIndex) {
    return toIndex
  }
  if (fromIndex < selectedIndex && toIndex >= selectedIndex) {
    return selectedIndex - 1
  }
  if (fromIndex > selectedIndex && toIndex <= selectedIndex) {
    return selectedIndex + 1
  }
  return selectedIndex
}

export function remapIndicesAfterMove(
  indices: number[],
  fromIndex: number,
  toIndex: number,
): number[] {
  return [...new Set(indices.map((index) => remapIndexAfterMove(index, fromIndex, toIndex)!))]
    .filter((index) => index != null)
    .sort((left, right) => left - right)
}

export function remapIndicesAfterDelete(indices: number[], deletedIndex: number): number[] {
  return indices
    .filter((index) => index !== deletedIndex)
    .map((index) => (index > deletedIndex ? index - 1 : index))
}

export function indicesAfterBringToFront(
  selectedIndices: number[],
  elementCount: number,
): number[] {
  const count = selectedIndices.length
  if (count === 0) {
    return []
  }
  return Array.from({ length: count }, (_, offset) => elementCount - count + offset)
}

export function indicesAfterSendToBack(selectedIndices: number[]): number[] {
  return selectedIndices.map((_, offset) => offset)
}
