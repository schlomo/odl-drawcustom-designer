import { describe, expect, it } from 'vitest'
import {
  accentModeToColorMode,
  colorModeToAccent,
  colorModeToColourScheme,
  colourSchemeToColorMode,
  FOUR_COLOR_PALETTE,
  isColourSchemeMode,
} from '../../../src/core/display/palette'

describe('colour_scheme helpers', () => {
  it('maps Basic Standard enum values to editor color modes', () => {
    expect(colourSchemeToColorMode(0x00)).toBe('bw')
    expect(colourSchemeToColorMode(0x01)).toBe('bwr')
    expect(colourSchemeToColorMode(0x02)).toBe('bwy')
    expect(colourSchemeToColorMode(0x03)).toBe('four')
    expect(colourSchemeToColorMode(0x04)).toBe('six')
  })

  it('maps editor color modes back to colour_scheme', () => {
    expect(colorModeToColourScheme('bw')).toBe(0x00)
    expect(colorModeToColourScheme('bwr')).toBe(0x01)
    expect(colorModeToColourScheme('bwy')).toBe(0x02)
    expect(colorModeToColourScheme('four')).toBe(0x03)
    expect(colorModeToColourScheme('six')).toBe(0x04)
  })

  it('maps accent keywords to color modes', () => {
    expect(accentModeToColorMode('red')).toBe('bwr')
    expect(accentModeToColorMode('yellow')).toBe('bwy')
    expect(colorModeToAccent('bwr')).toBe('red')
    expect(colorModeToAccent('bwy')).toBe('yellow')
    expect(colorModeToAccent('four')).toBe('red')
  })

  it('exposes the ODL 4-color palette', () => {
    expect(FOUR_COLOR_PALETTE).toEqual(['#000000', '#FFFFFF', '#FF0000', '#FFFF00'])
  })

  it('treats rgb as designer-only (no wire colour_scheme)', () => {
    expect(isColourSchemeMode('rgb')).toBe(false)
    expect(isColourSchemeMode('four')).toBe(true)
  })
})
