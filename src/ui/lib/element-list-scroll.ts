/**
 * Row to scroll to after a selection change, derived by diffing the
 * previous selection against the next. `selectedIndices` does NOT preserve
 * selection order — useProjectState numerically sorts additive selections
 * (sortIndices) — so "last entry" is merely the highest index, not the
 * most-recently clicked row.
 *
 * - Exactly one index newly present: that row is the one the user just
 *   selected — scroll to it.
 * - Several added at once (marquee / select-all-in-rect) or a shrink
 *   (shift-deselect): no single "just clicked" row exists — fall back to
 *   the primary the rest of the UI uses (`indices[length - 1]`:
 *   useProjectState's selectedIndex, PropertyPanel's primaryIndex).
 * - Unchanged or empty selection: nothing to scroll to.
 */
export function primaryElementListIndex(
  previous: readonly number[],
  next: readonly number[],
): number | null {
  if (next.length === 0) {
    return null
  }
  const previousSet = new Set(previous)
  const added = next.filter((index) => !previousSet.has(index))
  if (added.length === 1) {
    return added[0]!
  }
  const unchanged =
    added.length === 0 &&
    next.length === previous.length &&
    next.every((index, offset) => index === previous[offset])
  if (unchanged) {
    return null
  }
  return next[next.length - 1]!
}

/**
 * Gate for scrolling the selected row into view: only when there is a
 * target row, and never while the user is mid-drag-reorder in the list
 * itself. Mirrors the "don't yank what the user is touching" principle
 * from the YAML-pane scroll wiring (#41) — a drag-reorder in progress
 * must not be interrupted by an unrelated selection-driven scroll.
 */
export function shouldScrollListRow(
  targetIndex: number | null,
  dragIndex: number | null,
): boolean {
  return targetIndex != null && dragIndex == null
}
