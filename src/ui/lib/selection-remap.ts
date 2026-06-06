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
