import { describe, expect, it } from 'vitest'
import {
  effectiveHandleHitRadius,
  hitResizeHandle,
  isInteriorMovePoint,
  shouldPreferMoveOverResize,
} from '../../../src/ui/lib/canvas-resize-handles'

describe('hitResizeHandle', () => {
  const bounds = { x: 100, y: 80, width: 48, height: 48 }

  it('hits the southeast handle outside the element bounds', () => {
    const handle = hitResizeHandle({ x: 156, y: 136 }, bounds, ['se'])
    expect(handle).toBe('se')
  })

  it('misses when the pointer is far from handles', () => {
    expect(hitResizeHandle({ x: 0, y: 0 }, bounds, ['se'])).toBeNull()
  })

  it('shrinks hit radius on small elements', () => {
    const tiny = { x: 10, y: 10, width: 20, height: 20 }
    expect(effectiveHandleHitRadius(tiny)).toBeLessThan(8)
    expect(hitResizeHandle({ x: 30, y: 30 }, tiny, ['se'])).toBe('se')
    expect(isInteriorMovePoint({ x: 20, y: 20 }, tiny)).toBe(true)
    expect(shouldPreferMoveOverResize({ x: 20, y: 20 }, tiny, 'se')).toBe(true)
  })
})

describe('shouldPreferMoveOverResize', () => {
  const tiny = { x: 0, y: 0, width: 24, height: 24 }

  it('prefers move in the interior of small icons', () => {
    expect(shouldPreferMoveOverResize({ x: 12, y: 12 }, tiny, 'se')).toBe(true)
  })

  it('allows resize near the handle on small icons', () => {
    expect(shouldPreferMoveOverResize({ x: 24, y: 24 }, tiny, 'se')).toBe(false)
  })
})
