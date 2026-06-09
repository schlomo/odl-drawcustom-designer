import { describe, expect, it } from 'vitest'
import { mapColor } from '../../../src/core/renderer/colors'
import {
  applyOrderedDitherBuffer,
  finalizeTagImageData,
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
        if (sampleOrderedDitherColor(x, y, 'half_black', { colorMode: 'bwr' }) === '#000000') {
          dark += 1
        }
      }
    }
    expect(dark).toBe(8)
  })

  it('maps half_accent to red or yellow accent by tag mode', () => {
    expect(sampleOrderedDitherColor(0, 0, 'half_accent', { colorMode: 'bwr' })).toBe('#FF0000')
    expect(sampleOrderedDitherColor(1, 0, 'half_accent', { colorMode: 'bwr' })).toBe('#FFFFFF')
    expect(sampleOrderedDitherColor(0, 0, 'half_accent', { colorMode: 'bwy' })).toBe('#FFFF00')
    expect(sampleOrderedDitherColor(1, 0, 'half_accent', { colorMode: 'bwy' })).toBe('#FFFFFF')
  })

  it('returns flat mapColor for non-halftone names', () => {
    expect(sampleOrderedDitherColor(0, 0, 'red', { colorMode: 'bwr' })).toBe('#FF0000')
    expect(sampleOrderedDitherColor(0, 0, 'accent', { colorMode: 'bwy' })).toBe('#FFFF00')
  })

  it('uses gray halftone pairs in BW mode', () => {
    expect(sampleOrderedDitherColor(0, 0, 'half_red', { colorMode: 'bw' })).toBe('#808080')
  })

  it('produces mixed black and gray tiles for BW half_red with ordered dither', () => {
    const colors = new Set<string>()
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        colors.add(sampleOrderedDitherColor(x, y, 'half_red', { colorMode: 'bw', ditherMode: 2 }))
      }
    }
    expect(colors).toEqual(new Set(['#808080', '#FFFFFF']))
    expect(colors.has('#FF0000')).toBe(false)
  })
})

describe('resolveHalftonePair', () => {
  it('uses 25% black for half_white', () => {
    expect(resolveHalftonePair('hw', { colorMode: 'bwr' })).toEqual({
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
        const color = sampleOrderedDitherColor(x, y, 'half_red', { colorMode: 'bwr' })
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
    applyOrderedDitherBuffer(data, 1, 1, 'half_black', { colorMode: 'bwr', ditherMode: 0 })
    expect(Array.from(data)).toEqual([128, 128, 128, 255])
  })

  it('maps flat halftone RGB to dithered black/white when mode is ordered', () => {
    const gray = mapColor('half_black')!
    const r = Number.parseInt(gray.slice(1, 3), 16)
    const data = new Uint8ClampedArray([r, r, r, 255])
    applyOrderedDitherBuffer(data, 1, 1, 'half_black', { colorMode: 'bwr', ditherMode: 2 })
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0])
  })

  it('leaves solid white background untouched when dithering an export buffer', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
    applyOrderedDitherBuffer(data, 2, 1, null, { colorMode: 'bwy', ditherMode: 2 })
    expect(Array.from(data)).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })

  it('leaves clamped accent colors untouched when dithering without a halftone hint', () => {
    const data = new Uint8ClampedArray([255, 255, 0, 255])
    applyOrderedDitherBuffer(data, 1, 1, null, { colorMode: 'bwy', ditherMode: 2 })
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 0])
  })

  it('dithers flat gray image data in BW mode when d=2', () => {
    const data = new Uint8ClampedArray([
      128, 128, 128, 255,
      128, 128, 128, 255,
      128, 128, 128, 255,
      128, 128, 128, 255,
    ])
    finalizeTagImageData(data, 4, 1, { colorMode: 'bw', ditherMode: 2 })
    const reds = new Set([data[0], data[4], data[8], data[12]])
    expect(reds.has(0)).toBe(true)
    expect(reds.has(255)).toBe(true)
    expect(reds.has(128)).toBe(false)
  })
})
