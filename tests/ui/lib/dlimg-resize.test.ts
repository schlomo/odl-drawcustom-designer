import { describe, expect, it } from 'vitest'
import { dlimgImageDrawParams } from '../../../src/ui/lib/dlimg-resize'

function mockImage(width: number, height: number) {
  return { naturalWidth: width, naturalHeight: height, width, height }
}

describe('dlimgImageDrawParams', () => {
  const dest = { x: 10, y: 20, width: 100, height: 50 }

  it('stretches to the destination box by default', () => {
    expect(dlimgImageDrawParams(mockImage(200, 200), dest, undefined)).toMatchObject({
      dx: 10,
      dy: 20,
      dw: 100,
      dh: 50,
      clip: false,
    })
  })

  it('letterboxes with contain when aspect ratios differ', () => {
    const params = dlimgImageDrawParams(mockImage(200, 100), { x: 0, y: 0, width: 100, height: 80 }, 'contain')
    expect(params.dw).toBe(100)
    expect(params.dh).toBe(50)
    expect(params.dx).toBe(0)
    expect(params.dy).toBe(15)
    expect(params.clip).toBe(false)
  })

  it('fills and clips with cover when aspect ratios differ', () => {
    const params = dlimgImageDrawParams(mockImage(200, 100), { x: 0, y: 0, width: 100, height: 80 }, 'cover')
    expect(params.dw).toBe(160)
    expect(params.dh).toBe(80)
    expect(params.dx).toBe(-30)
    expect(params.clip).toBe(true)
  })

  it('fills and clips with crop', () => {
    const params = dlimgImageDrawParams(mockImage(100, 200), dest, 'crop')
    expect(params.dw).toBe(100)
    expect(params.dh).toBe(200)
    expect(params.clip).toBe(true)
  })
})
