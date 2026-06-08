import { describe, expect, it } from 'vitest'
import { mapColor } from '../../../src/core/renderer/colors'
import {
  applyOrderedDitherBuffer,
  isHalftoneColorName,
  resolveHalftonePair,
  sampleOrderedDitherColor,
  shouldUseHalftonePattern,
} from '../../../src/core/renderer/dither'

describe('isHalftoneColorName', () => {
  it('recognizes halftone aliases from the spec', () => {
    expect(isHalftoneColorName('half_black')).toBe(true)
    expect(isHalftoneColorName('gray')).toBe(true)
    expect(isHalftoneColorName('hb')).toBe(true)
    expect(isHalftoneColorName('half_accent')).toBe(true)
    expect(isHalftoneColorName('ha')).toBe(true)
    expect(isHalftoneColorName('black')).toBe(false)
    expect(isHalftoneColorName('accent')).toBe(false)
  })
})

describe('sampleOrderedDitherColor', () => {
  it('produces a 50/50 Bayer tile for half_black', () => {
    let dark = 0
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (sampleOrderedDitherColor(x, y, 'half_black', 'red') === '#000000') {
          dark += 1
        }
      }
    }
    expect(dark).toBe(8)
  })

  it('maps half_accent to red or yellow accent by tag mode', () => {
    expect(sampleOrderedDitherColor(0, 0, 'half_accent', 'red')).toBe('#FF0000')
    expect(sampleOrderedDitherColor(1, 0, 'half_accent', 'red')).toBe('#FFFFFF')
    expect(sampleOrderedDitherColor(0, 0, 'half_accent', 'yellow')).toBe('#FFFF00')
    expect(sampleOrderedDitherColor(1, 0, 'half_accent', 'yellow')).toBe('#FFFFFF')
  })

  it('returns flat mapColor for non-halftone names', () => {
    expect(sampleOrderedDitherColor(0, 0, 'red', 'red')).toBe('#FF0000')
    expect(sampleOrderedDitherColor(0, 0, 'accent', 'yellow')).toBe('#FFFF00')
  })
})

describe('resolveHalftonePair', () => {
  it('uses 25% black for half_white', () => {
    expect(resolveHalftonePair('hw', 'red')).toEqual({
      light: '#FFFFFF',
      dark: '#000000',
      ratio: 0.25,
    })
  })
})

describe('shouldUseHalftonePattern', () => {
  it('enables patterns only for halftone colors with ordered dither', () => {
    expect(shouldUseHalftonePattern('half_red', 2)).toBe(true)
    expect(shouldUseHalftonePattern('half_red', 0)).toBe(false)
    expect(shouldUseHalftonePattern('red', 2)).toBe(false)
  })
})

describe('applyOrderedDitherBuffer', () => {
  it('checksums a known 2×2 half_red swatch', () => {
    const width = 8
    const height = 8
    const buffer = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const color = sampleOrderedDitherColor(x, y, 'half_red', 'red')
        const rgb =
          color === '#FF0000'
            ? [255, 0, 0]
            : color === '#FFFFFF'
              ? [255, 255, 255]
              : [0, 0, 0]
        buffer[i] = rgb[0]
        buffer[i + 1] = rgb[1]
        buffer[i + 2] = rgb[2]
        buffer[i + 3] = 255
      }
    }

    let checksum = 0
    for (const byte of buffer) {
      checksum = (checksum + byte) % 1_000_000_007
    }
    expect(checksum).toBe(48_960)
  })

  it('leaves solid colors unchanged when dither mode is flat', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 255])
    applyOrderedDitherBuffer(data, 1, 1, 'half_black', 'red', 0)
    expect(Array.from(data)).toEqual([128, 128, 128, 255])
  })

  it('maps flat halftone RGB to dithered black/white when mode is ordered', () => {
    const gray = mapColor('half_black')!
    const r = Number.parseInt(gray.slice(1, 3), 16)
    const data = new Uint8ClampedArray([r, r, r, 255])
    applyOrderedDitherBuffer(data, 1, 1, 'half_black', 'red', 2)
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0])
  })
})
