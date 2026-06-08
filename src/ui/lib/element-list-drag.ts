/** Indices to move when dragging a row in the layer list. */
export function elementListDragIndices(
  dragIndex: number,
  selectedIndices: readonly number[],
): number[] {
  if (selectedIndices.includes(dragIndex) && selectedIndices.length > 1) {
    return [...selectedIndices].sort((left, right) => left - right)
  }
  return [dragIndex]
}

/**
 * Skip drops that would not change order (same row, or reorder block onto itself).
 * Returns null when the drop should be ignored.
 */
export function normalizeElementListDropIndex(
  dragIndex: number,
  dropIndex: number,
  movingIndices: readonly number[],
): number | null {
  if (dragIndex === dropIndex) {
    return null
  }
  if (movingIndices.length <= 1) {
    return dropIndex
  }
  const moving = new Set(movingIndices)
  if (!moving.has(dropIndex)) {
    return dropIndex
  }
  // Dropping on another selected row: nudge toward the drag direction in storage order.
  if (dropIndex > dragIndex) {
    const after = Math.max(...movingIndices) + 1
    return after
  }
  const before = Math.min(...movingIndices) - 1
  return before >= 0 ? before : null
}
