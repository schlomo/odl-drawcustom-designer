import { describe, expect, it } from 'vitest'
import {
  clampHexToColorMode,
  clampImageDataToColorMode,
  clampRgbToColorMode,
  imageDataUsesOnlyPaletteColors,
} from '../../../src/core/display/palette-clamp'

describe('clampRgbToColorMode', () => {
  it('maps saturated colors to black or white in BW mode', () => {
    expect(clampRgbToColorMode(255, 0, 0, 'bw')).toEqual([0, 0, 0])
    expect(clampRgbToColorMode(255, 255, 255, 'bw')).toEqual([255, 255, 255])
    expect(clampRgbToColorMode(248, 250, 252, 'bw')).toEqual([255, 255, 255])
  })

  it('keeps accent red in BWR mode and clamps unknown chroma to the palette', () => {
    expect(clampRgbToColorMode(255, 0, 0, 'bwr')).toEqual([255, 0, 0])
    expect(clampRgbToColorMode(0, 255, 0, 'bwr')).toEqual([128, 128, 128])
  })

  it('passes through arbitrary RGB in preview mode', () => {
    expect(clampRgbToColorMode(51, 102, 153, 'rgb')).toEqual([51, 102, 153])
  })

  it('clamps saturated yellow to grey on BWR (wrong accent primary)', () => {
    expect(clampRgbToColorMode(255, 255, 0, 'bwr')).toEqual([128, 128, 128])
  })

  it('clamps saturated red to grey on BWY (wrong accent primary)', () => {
    expect(clampRgbToColorMode(255, 0, 0, 'bwy')).toEqual([128, 128, 128])
  })
})

describe('clampHexToColorMode', () => {
  it('clamps designer hex accents to monochrome in BW mode', () => {
    expect(clampHexToColorMode('#FF0000', 'bw')).toBe('#000000')
    expect(clampHexToColorMode('#FFFF00', 'bw')).toBe('#000000')
  })
})

describe('clampImageDataToColorMode', () => {
  it('removes out-of-palette pixels from an RGBA buffer', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 255, 255, 255,
      0, 255, 0, 255,
    ])
    clampImageDataToColorMode(data, 'bw')
    expect(imageDataUsesOnlyPaletteColors(data, 'bw')).toBe(true)
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0])
    expect([data[8], data[9], data[10]]).toEqual([0, 0, 0])
  })
})
