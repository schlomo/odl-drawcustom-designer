import { describe, expect, it } from 'vitest'
import { finalizeTagImageData, imageDataUsesOnlyPaletteColors } from '../../../src/core'
import { resolveExportDitherMode } from '../../../src/ui/lib/canvas-png-export'

/**
 * Export dimensions are the logical canvas, unturned (issue #139) — proven end
 * to end on the real export path in `tests/e2e/embed-targets.spec.ts`
 * ("the exported PNG is the upright logical canvas"), which reads the PNG
 * header of a downloaded file. jsdom has no canvas, so the rasterizing half of
 * this module is not unit-testable here.
 */
describe('canvas PNG export helpers', () => {
  it('prefers preview dither mode when set to halftone', () => {
    expect(resolveExportDitherMode(2, 0)).toBe(2)
  })

  it('falls back to service dither when preview is flat', () => {
    expect(resolveExportDitherMode(0, 2)).toBe(2)
    expect(resolveExportDitherMode(0, 1)).toBe(0)
  })

  it('clamps export buffers to the active tag palette', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255])
    finalizeTagImageData(data, 2, 1, { colorMode: 'bw', ditherMode: 0 })
    expect(imageDataUsesOnlyPaletteColors(data, 'bw')).toBe(true)
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0])
  })

  it('does not dither solid white after palette clamp in BWY export', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
    finalizeTagImageData(data, 2, 1, { colorMode: 'bwy', ditherMode: 2 })
    expect(Array.from(data)).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })

  it('clamps yellow pixels to grey on BWR in flat export finalize', () => {
    const data = new Uint8ClampedArray([255, 255, 0, 255])
    finalizeTagImageData(data, 1, 1, { colorMode: 'bwr', ditherMode: 0 })
    expect([data[0], data[1], data[2]]).toEqual([128, 128, 128])
  })
})
