import type { DrawElement } from '../../core'
import { moveElementInArray } from './element-geometry'
import { remapIndicesAfterMove } from './selection-remap'

function sortIndices(indices: number[]): number[] {
  return [...indices].sort((left, right) => left - right)
}

/** Move a contiguous block of selected elements to `dropIndex`, collecting them together. */
export function reorderSelectionBlock(
  elements: DrawElement[],
  selectedIndices: number[],
  dropIndex: number,
): { elements: DrawElement[]; indices: number[] } {
  if (selectedIndices.length === 0) {
    return { elements, indices: [] }
  }

  if (selectedIndices.length === 1) {
    const fromIndex = selectedIndices[0]!
    const next = moveElementInArray(elements, fromIndex, dropIndex)
    return {
      elements: next,
      indices: [remapIndicesAfterMove(selectedIndices, fromIndex, dropIndex)[0] ?? fromIndex],
    }
  }

  const selected = new Set(selectedIndices)
  const sorted = sortIndices(selectedIndices)
  const block = sorted.map((index) => elements[index]!)
  const remaining = elements.filter((_, index) => !selected.has(index))

  let insertAt = 0
  for (let index = 0; index < dropIndex; index += 1) {
    if (!selected.has(index)) {
      insertAt += 1
    }
  }
  insertAt = Math.max(0, Math.min(insertAt, remaining.length))

  const next = [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)]
  const indices = block.map((_, offset) => insertAt + offset)
  return { elements: next, indices }
}
