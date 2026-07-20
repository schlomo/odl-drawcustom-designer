import { describe, expect, it } from 'vitest'
import { capabilitiesToCanvas } from '../../src/embed/hostContract'
import type { CanvasConfig } from '../../src/ui/hooks/useProjectState'

/**
 * Host `capabilities` contract (issue #20): mirrors the payload shape of the
 * OpenDisplay HA integration PR #44 `capabilities.py` and maps it onto the
 * designer's canvas + tag-palette model. Behavior under test: the canvas
 * config an embedded host observes after pushing capabilities.
 */

const CURRENT: CanvasConfig = {
  width: 384,
  height: 184,
  rotation: 0,
  colorMode: 'bwr',
  previewDitherMode: 2,
}

describe('capabilitiesToCanvas', () => {
  it('maps a full PR #44-shaped payload onto canvas size, rotation and palette', () => {
    const next = capabilitiesToCanvas(
      {
        pixel_width: 128,
        pixel_height: 296,
        rotation_degrees: 90,
        render_width: 296,
        render_height: 128,
        color_scheme: 0x01,
        accent_color: 'red',
        available_colors: ['black', 'white', 'red'],
        color_map: { black: '#000000', white: '#ffffff', red: '#ff0000' },
        palette_measured: false,
      },
      CURRENT,
    )
    expect(next).toMatchObject({
      width: 296,
      height: 128,
      rotation: 90,
      colorMode: 'bwr',
    })
  })

  it('prefers render dimensions over pixel dimensions', () => {
    const next = capabilitiesToCanvas(
      { pixel_width: 100, pixel_height: 200, render_width: 296, render_height: 128 },
      CURRENT,
    )
    expect(next.width).toBe(296)
    expect(next.height).toBe(128)
  })

  it('derives render size from pixel size by swapping at 90/270 degrees', () => {
    const next = capabilitiesToCanvas(
      { pixel_width: 400, pixel_height: 300, rotation_degrees: 270 },
      CURRENT,
    )
    expect(next).toMatchObject({ width: 300, height: 400, rotation: 270 })

    const flat = capabilitiesToCanvas(
      { pixel_width: 400, pixel_height: 300, rotation_degrees: 180 },
      CURRENT,
    )
    expect(flat).toMatchObject({ width: 400, height: 300, rotation: 180 })
  })

  it('maps Basic Standard color_scheme values onto tag color modes', () => {
    expect(capabilitiesToCanvas({ color_scheme: 0x00 }, CURRENT).colorMode).toBe('bw')
    expect(capabilitiesToCanvas({ color_scheme: 0x01 }, CURRENT).colorMode).toBe('bwr')
    expect(capabilitiesToCanvas({ color_scheme: 0x02 }, CURRENT).colorMode).toBe('bwy')
    expect(capabilitiesToCanvas({ color_scheme: 0x03 }, CURRENT).colorMode).toBe('four')
    expect(capabilitiesToCanvas({ color_scheme: 0x04 }, CURRENT).colorMode).toBe('six')
  })

  it('infers the color mode from color_map palette names when no color_scheme is given', () => {
    const infer = (names: string[]) =>
      capabilitiesToCanvas(
        { color_map: Object.fromEntries(names.map((name) => [name, '#000000'])) },
        CURRENT,
      ).colorMode

    expect(infer(['black', 'white'])).toBe('bw')
    expect(infer(['black', 'white', 'red'])).toBe('bwr')
    expect(infer(['black', 'white', 'yellow'])).toBe('bwy')
    expect(infer(['black', 'white', 'red', 'yellow'])).toBe('four')
    expect(infer(['black', 'white', 'red', 'yellow', 'blue', 'green'])).toBe('six')
  })

  it('falls back to available_colors, then accent_color', () => {
    expect(
      capabilitiesToCanvas({ available_colors: ['black', 'white', 'yellow'] }, CURRENT).colorMode,
    ).toBe('bwy')
    expect(capabilitiesToCanvas({ accent_color: 'yellow' }, CURRENT).colorMode).toBe('bwy')
    expect(capabilitiesToCanvas({ accent_color: 'red' }, CURRENT).colorMode).toBe('bwr')
  })

  it('keeps the current canvas for empty or invalid capability fields', () => {
    expect(capabilitiesToCanvas({}, CURRENT)).toEqual(CURRENT)
    // Non-quarter rotations are not representable; keep the current rotation.
    expect(capabilitiesToCanvas({ rotation_degrees: 45 }, CURRENT).rotation).toBe(
      CURRENT.rotation,
    )
    expect(capabilitiesToCanvas({ color_scheme: 99 }, CURRENT).colorMode).toBe(CURRENT.colorMode)
  })

  it('normalizes out-of-range rotations into 0..270', () => {
    expect(capabilitiesToCanvas({ rotation_degrees: 360 }, CURRENT).rotation).toBe(0)
    expect(capabilitiesToCanvas({ rotation_degrees: 450 }, CURRENT).rotation).toBe(90)
    expect(capabilitiesToCanvas({ rotation_degrees: -90 }, CURRENT).rotation).toBe(270)
  })

  it('preserves designer-only preview settings', () => {
    expect(capabilitiesToCanvas({ pixel_width: 296, pixel_height: 128 }, CURRENT).previewDitherMode).toBe(
      CURRENT.previewDitherMode,
    )
  })

  // Issue #68: measured color_map hexes become the active palette overrides.
  it('adopts measured color_map hexes as palette overrides', () => {
    const next = capabilitiesToCanvas(
      {
        color_scheme: 0x01,
        color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
        palette_measured: true,
      },
      CURRENT,
    )
    expect(next.paletteOverrides).toEqual({
      black: '#000000',
      white: '#FFFFFF',
      red: '#C53929',
    })
  })

  it('drops unknown color names and invalid hexes from the overrides', () => {
    const next = capabilitiesToCanvas(
      { color_map: { red: '#c53929', chartreuse: '#7fff00', yellow: 'nope' } },
      CURRENT,
    )
    expect(next.paletteOverrides).toEqual({ red: '#C53929' })
  })

  it('keeps current palette overrides when the push has no color_map', () => {
    const withOverrides: CanvasConfig = {
      ...CURRENT,
      paletteOverrides: { red: '#C53929' },
    }
    expect(capabilitiesToCanvas({ rotation_degrees: 90 }, withOverrides).paletteOverrides).toEqual(
      { red: '#C53929' },
    )
    expect(capabilitiesToCanvas({}, CURRENT).paletteOverrides).toBeUndefined()
  })
})
