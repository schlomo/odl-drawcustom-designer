import { describe, expect, it, vi } from 'vitest'
import { dlimgImageDrawParams, drawDlimgToCanvas } from '../../../src/ui/lib/dlimg-resize'

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

describe('drawDlimgToCanvas color mode', () => {
  it('clamps drawn pixels to the active tag palette', () => {
    const dest = { x: 10, y: 20, width: 2, height: 1 }
    const image = mockImage(2, 1) as HTMLImageElement
    let clamped: Uint8ClampedArray | null = null

    const ctx = {
      drawImage: vi.fn(),
      getImageData: () => ({
        width: dest.width,
        height: dest.height,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
      }),
      putImageData: (imageData: ImageData) => {
        clamped = imageData.data
      },
    } as unknown as CanvasRenderingContext2D

    drawDlimgToCanvas(ctx, image, dest, 'stretch', { colorMode: 'bw', ditherMode: 0 })

    expect(ctx.drawImage).toHaveBeenCalled()
    expect(clamped).toEqual(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]))
  })

  it('Bayer-dithers clamped gray tones in BW preview when d=2', () => {
    const dest = { x: 0, y: 0, width: 4, height: 1 }
    const image = mockImage(4, 1) as HTMLImageElement
    let processed: Uint8ClampedArray | null = null

    const ctx = {
      drawImage: vi.fn(),
      getImageData: () => ({
        width: dest.width,
        height: dest.height,
        data: new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255]),
      }),
      putImageData: (imageData: ImageData) => {
        processed = imageData.data
      },
    } as unknown as CanvasRenderingContext2D

    drawDlimgToCanvas(ctx, image, dest, 'stretch', { colorMode: 'bw', ditherMode: 2 })

    expect(processed).not.toBeNull()
    const values = new Set<number>()
    for (let index = 0; index < 4; index++) {
      values.add(processed![index * 4])
    }
    expect(values.has(0)).toBe(true)
    expect(values.has(255)).toBe(true)
  })
})
