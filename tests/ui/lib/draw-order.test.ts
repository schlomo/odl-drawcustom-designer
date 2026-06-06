import { describe, expect, it } from 'vitest'
import {
  isBackElementIndex,
  isFrontElementIndex,
  layerPanelDisplayOrder,
} from '../../../src/ui/lib/draw-order'
import { moveElementInArray } from '../../../src/ui/lib/element-geometry'

describe('draw order', () => {
  it('treats the last payload item as front and the first as back', () => {
    expect(isBackElementIndex(0)).toBe(true)
    expect(isFrontElementIndex(0, 3)).toBe(false)
    expect(isFrontElementIndex(2, 3)).toBe(true)
  })

  it('shows front elements at the top of the layer panel', () => {
    expect(layerPanelDisplayOrder(['a', 'b', 'c']).map((entry) => entry.index)).toEqual([2, 1, 0])
  })

  it('moves toward the end of the YAML list toward the front', () => {
    const items = ['back', 'middle', 'front']
    expect(moveElementInArray(items, 0, 2)).toEqual(['middle', 'front', 'back'])
    expect(moveElementInArray(items, 1, 2)).toEqual(['back', 'front', 'middle'])
  })
})
