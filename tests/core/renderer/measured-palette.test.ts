import { describe, expect, it } from 'vitest'
import {
  normalizePaletteOverrides,
  type PaletteOverrides,
} from '../../../src/core/display/palette-overrides'
import {
  clampHexToColorMode,
  imageDataUsesOnlyPaletteColors,
  paletteColorsForMode,
} from '../../../src/core/display/palette-clamp'
import { mapColor } from '../../../src/core/renderer/colors'
import { finalizeTagImageData, halftoneTileColors } from '../../../src/core/renderer/dither'
import { renderRectangle } from '../../../src/core/renderer/rectangle'
import { resolvePreviewPaint } from '../../../src/core/renderer/preview-paint'

/**
 * Issue #68: a host-pushed measured `color_map` (name → hex) re-colors the
 * ACTIVE palette — preview, PNG export finalize, and swatches all paint the
 * measured hexes. Without overrides every path stays byte-identical to the
 * canonical palettes.
 */

const MEASURED_RED = '#C53929'
const OVERRIDES: PaletteOverrides = { red: MEASURED_RED }

describe('normalizePaletteOverrides', () => {
  it('keeps only known palette color names with valid hexes, normalized to #RRGGBB', () => {
    expect(
      normalizePaletteOverrides({
        black: '#000000',
        RED: '#c53929',
        white: '#fff',
        chartreuse: '#7fff00',
        yellow: 'not-a-hex',
      }),
    ).toEqual({ black: '#000000', red: '#C53929', white: '#FFFFFF' })
  })

  it('returns undefined for an absent or empty map', () => {
    expect(normalizePaletteOverrides(undefined)).toBeUndefined()
    expect(normalizePaletteOverrides({})).toBeUndefined()
    expect(normalizePaletteOverrides({ mauve: '#e0b0ff' })).toBeUndefined()
  })
})

describe('mapColor with measured palette overrides', () => {
  it('resolves the overridden name and its alias to the measured hex', () => {
    const options = { colorMode: 'bwr' as const, paletteOverrides: OVERRIDES }
    expect(mapColor('red', options)).toBe(MEASURED_RED)
    expect(mapColor('r', options)).toBe(MEASURED_RED)
  })

  it('resolves the accent keyword to the measured accent hex', () => {
    expect(mapColor('accent', { colorMode: 'bwr', paletteOverrides: OVERRIDES })).toBe(
      MEASURED_RED,
    )
  })

  it('derives half tones by blending the measured primary with white', () => {
    // mix(#C53929, #FFFFFF, 50%) → #E29C94
    expect(mapColor('half_red', { colorMode: 'bwr', paletteOverrides: OVERRIDES })).toBe(
      '#E29C94',
    )
  })

  it('stays canonical without overrides', () => {
    expect(mapColor('red', { colorMode: 'bwr' })).toBe('#FF0000')
    expect(mapColor('accent', { colorMode: 'bwr' })).toBe('#FF0000')
    expect(mapColor('half_red', { colorMode: 'bwr' })).toBe('#FF8080')
  })
})

describe('palette clamp with measured palette overrides', () => {
  it('snaps canonical red input onto the measured red', () => {
    expect(clampHexToColorMode('#FF0000', 'bwr', OVERRIDES)).toBe(MEASURED_RED)
  })

  it('keeps a pixel already painted in the measured hex', () => {
    expect(clampHexToColorMode(MEASURED_RED, 'bwr', OVERRIDES)).toBe(MEASURED_RED)
  })

  it('exposes the measured palette as the active palette for the mode', () => {
    expect(paletteColorsForMode('bwr', OVERRIDES)).toContain(MEASURED_RED)
    expect(paletteColorsForMode('bwr', OVERRIDES)).not.toContain('#FF0000')
  })

  it('stays canonical without overrides', () => {
    expect(clampHexToColorMode('#FF0000', 'bwr')).toBe('#FF0000')
    expect(paletteColorsForMode('bwr')).toEqual([
      '#000000',
      '#FFFFFF',
      '#FF0000',
      '#808080',
      '#BFBFBF',
      '#FF8080',
    ])
  })
})

describe('render path adopts measured hexes (issue #68 acceptance)', () => {
  it('paints a red rectangle with the measured hex when overrides are active', () => {
    const result = renderRectangle(
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10, fill: 'red' },
      { width: 100, height: 100, colorMode: 'bwr', paletteOverrides: OVERRIDES },
    )
    expect(result?.layer).toBe('svg')
    if (result?.layer === 'svg' && result.primitive.kind === 'rect') {
      expect(result.primitive.fill).toBe(MEASURED_RED)
    }
  })

  it('renders byte-identically to today without a host push', () => {
    const result = renderRectangle(
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10, fill: 'red' },
      { width: 100, height: 100, colorMode: 'bwr' },
    )
    if (result?.layer === 'svg' && result.primitive.kind === 'rect') {
      expect(result.primitive.fill).toBe('#FF0000')
    }
  })

  it('resolves preview paint through the same overridden palette', () => {
    expect(
      resolvePreviewPaint('red', { colorMode: 'bwr', paletteOverrides: OVERRIDES }),
    ).toBe(MEASURED_RED)
  })
})

describe('export finalize pixel sampling with measured palette overrides', () => {
  it('keeps measured-red pixels intact and snaps canonical red onto them', () => {
    // Pixel 0: measured red (197, 57, 41). Pixel 1: canonical red.
    const data = new Uint8ClampedArray([197, 57, 41, 255, 255, 0, 0, 255])
    finalizeTagImageData(data, 2, 1, {
      colorMode: 'bwr',
      ditherMode: 0,
      paletteOverrides: OVERRIDES,
    })
    expect([data[0], data[1], data[2]]).toEqual([197, 57, 41])
    expect([data[4], data[5], data[6]]).toEqual([197, 57, 41])
    expect(imageDataUsesOnlyPaletteColors(data, 'bwr', OVERRIDES)).toBe(true)
  })

  it('finalizes byte-identically to today without overrides', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 0, 255])
    finalizeTagImageData(data, 2, 1, { colorMode: 'bwr', ditherMode: 0 })
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0])
    // Yellow on BWR clamps to unprintable grey — unchanged.
    expect([data[4], data[5], data[6]]).toEqual([128, 128, 128])
  })
})

describe('halftone dither with measured palette overrides', () => {
  it('builds half_red tiles from measured red and white', () => {
    const colors = halftoneTileColors('half_red', {
      colorMode: 'bwr',
      ditherMode: 2,
      paletteOverrides: OVERRIDES,
    })
    expect(colors).toContain(MEASURED_RED)
    expect(colors).toContain('#FFFFFF')
    expect(colors).not.toContain('#FF0000')
  })

  it('builds canonical half_red tiles without overrides', () => {
    const colors = halftoneTileColors('half_red', { colorMode: 'bwr', ditherMode: 2 })
    expect(colors).toContain('#FF0000')
    expect(colors).toContain('#FFFFFF')
  })
})
