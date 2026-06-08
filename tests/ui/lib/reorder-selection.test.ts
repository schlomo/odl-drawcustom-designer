import { describe, expect, it } from 'vitest'
import { reorderSelectionBlock } from '../../../src/ui/lib/reorder-selection'

describe('reorderSelectionBlock', () => {
  const elements = ['a', 'b', 'c', 'd', 'e', 'f'] as unknown as import('../../../src/core').DrawElement[]

  it('moves a single index like moveElementInArray', () => {
    const { elements: next, indices } = reorderSelectionBlock(elements, [2], 5)
    expect(next).toEqual(['a', 'b', 'd', 'e', 'f', 'c'])
    expect(indices).toEqual([5])
  })

  it('collects a multi-selection block at the drop index', () => {
    const { elements: next, indices } = reorderSelectionBlock(elements, [1, 3, 5], 0)
    expect(next).toEqual(['b', 'd', 'f', 'a', 'c', 'e'])
    expect(indices).toEqual([0, 1, 2])
  })

  it('inserts a block before a non-selected drop target', () => {
    const { elements: next, indices } = reorderSelectionBlock(elements, [1, 3, 5], 2)
    expect(next).toEqual(['a', 'b', 'd', 'f', 'c', 'e'])
    expect(indices).toEqual([1, 2, 3])
  })
})
