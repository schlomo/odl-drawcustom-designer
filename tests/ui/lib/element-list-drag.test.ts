import { describe, expect, it } from 'vitest'
import {
  elementListDragIndices,
  normalizeElementListDropIndex,
} from '../../../src/ui/lib/element-list-drag'

describe('element list drag', () => {
  it('drags the full selection when the handle row is selected', () => {
    expect(elementListDragIndices(2, [1, 2, 4])).toEqual([1, 2, 4])
    expect(elementListDragIndices(3, [1, 2, 4])).toEqual([3])
  })

  it('ignores self-drops and nudges block drops toward the drag direction', () => {
    expect(normalizeElementListDropIndex(2, 2, [1, 2, 3])).toBeNull()
    expect(normalizeElementListDropIndex(1, 2, [1, 2, 3])).toBe(4)
    expect(normalizeElementListDropIndex(3, 1, [1, 2, 3])).toBe(0)
  })
})
