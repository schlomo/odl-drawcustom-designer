import { describe, expect, it } from 'vitest'
import { layerPanelDisplayOrder } from '../../../src/ui/lib/draw-order'
import { moveElementInArray } from '../../../src/ui/lib/element-geometry'

describe('draw order', () => {
  it('shows front elements at the top of the layer panel', () => {
    expect(layerPanelDisplayOrder(['a', 'b', 'c']).map((entry) => entry.index)).toEqual([2, 1, 0])
  })

  it('moves toward the end of the YAML list toward the front', () => {
    const items = ['back', 'middle', 'front']
    expect(moveElementInArray(items, 0, 2)).toEqual(['middle', 'front', 'back'])
    expect(moveElementInArray(items, 1, 2)).toEqual(['back', 'front', 'middle'])
  })
})
