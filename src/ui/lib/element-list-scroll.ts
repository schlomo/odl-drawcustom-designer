/**
 * Primary (most-recently selected) index for scroll targeting — mirrors
 * useProjectState's own `selectedIndex` definition: the last entry in
 * `selectedIndices` is the most-recently selected element on multi-select.
 */
export function primaryElementListIndex(selectedIndices: readonly number[]): number | null {
  return selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1]! : null
}

/**
 * Gate for scrolling the selected row into view: only when there is a
 * primary selection, and never while the user is mid-drag-reorder in the
 * list itself. Mirrors the "don't yank what the user is touching"
 * principle from the YAML-pane scroll wiring (#41) — a drag-reorder in
 * progress must not be interrupted by an unrelated selection-driven scroll.
 */
export function shouldScrollListRow(
  primaryIndex: number | null,
  dragIndex: number | null,
): boolean {
  return primaryIndex != null && dragIndex == null
}
