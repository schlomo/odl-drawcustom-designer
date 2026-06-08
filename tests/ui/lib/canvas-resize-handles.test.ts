import { describe, expect, it } from 'vitest'
import { hitResizeHandle } from '../../../src/ui/lib/canvas-resize-handles'

describe('hitResizeHandle', () => {
  const bounds = { x: 100, y: 80, width: 48, height: 48 }

  it('hits the southeast handle outside the element bounds', () => {
    const handle = hitResizeHandle({ x: 156, y: 136 }, bounds, ['se'])
    expect(handle).toBe('se')
  })

  it('misses when the pointer is far from handles', () => {
    expect(hitResizeHandle({ x: 0, y: 0 }, bounds, ['se'])).toBeNull()
  })

})
