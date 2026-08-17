import { describe, expect, it } from 'vitest'
import { capabilitiesToCanvas } from '../../src/embed/hostContract'
import { DEFAULT_DISPLAY_CONFIG } from '../../src/ui/preferences/displayConfig'

/**
 * What a display *is*: a {@link HostTarget}'s `capabilities` mirror the
 * payload shape of the OpenDisplay HA integration's `capabilities.py` and map
 * onto the designer's canvas + tag-palette model. Behavior under test: the
 * canvas config a host observes once the designer is pinned to that display.
 *
 * The mapping resolves from the designer's **canonical defaults** — a display
 * *is* a display, so the same capabilities must produce the same canvas
 * whatever preceded them (issue #106 ruling; at 2.0 this is the only base,
 * since the merge-onto-current `capabilities` channel is gone, issue #121).
 * `previewDitherMode` is the sole thing carried in from the current canvas: it
 * belongs to no display.
 */

/** A designer-only preview setting, deliberately unlike the default. */
const DITHER: 0 | 2 = 2

describe('capabilitiesToCanvas', () => {
  it('maps a full capabilities payload onto canvas size, rotation and palette', () => {
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
      DITHER,
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
      DITHER,
    )
    expect(next.width).toBe(296)
    expect(next.height).toBe(128)
  })

  it('derives render size from pixel size by swapping at 90/270 degrees', () => {
    const next = capabilitiesToCanvas(
      { pixel_width: 400, pixel_height: 300, rotation_degrees: 270 },
      DITHER,
    )
    expect(next).toMatchObject({ width: 300, height: 400, rotation: 270 })

    const flat = capabilitiesToCanvas(
      { pixel_width: 400, pixel_height: 300, rotation_degrees: 180 },
      DITHER,
    )
    expect(flat).toMatchObject({ width: 400, height: 300, rotation: 180 })
  })

  it('resolves what a display does not declare from the canonical defaults', () => {
    // Not from the canvas in front of the user: a display that mentions no size
    // and no palette is not inheriting the previous display's (issue #106
    // ruling — a measured `color_map` on the wrong panel is silently wrong ink,
    // ADR-007). The old merge-onto-current base died with the `capabilities`
    // channel (issue #121), and with it the rotation-only-push quirk.
    const next = capabilitiesToCanvas({}, DITHER)

    expect(next).toEqual({ ...DEFAULT_DISPLAY_CONFIG, previewDitherMode: DITHER })

    const rotatedOnly = capabilitiesToCanvas({ rotation_degrees: 90 }, DITHER)
    expect(rotatedOnly).toMatchObject({
      width: DEFAULT_DISPLAY_CONFIG.width,
      height: DEFAULT_DISPLAY_CONFIG.height,
      rotation: 90,
    })
  })

  it('maps Basic Standard color_scheme values onto tag color modes', () => {
    expect(capabilitiesToCanvas({ color_scheme: 0x00 }, DITHER).colorMode).toBe('bw')
    expect(capabilitiesToCanvas({ color_scheme: 0x01 }, DITHER).colorMode).toBe('bwr')
    expect(capabilitiesToCanvas({ color_scheme: 0x02 }, DITHER).colorMode).toBe('bwy')
    expect(capabilitiesToCanvas({ color_scheme: 0x03 }, DITHER).colorMode).toBe('four')
    expect(capabilitiesToCanvas({ color_scheme: 0x04 }, DITHER).colorMode).toBe('six')
  })

  it('infers the color mode from color_map palette names when no color_scheme is given', () => {
    const infer = (names: string[]) =>
      capabilitiesToCanvas(
        { color_map: Object.fromEntries(names.map((name) => [name, '#000000'])) },
        DITHER,
      ).colorMode

    expect(infer(['black', 'white'])).toBe('bw')
    expect(infer(['black', 'white', 'red'])).toBe('bwr')
    expect(infer(['black', 'white', 'yellow'])).toBe('bwy')
    expect(infer(['black', 'white', 'red', 'yellow'])).toBe('four')
    expect(infer(['black', 'white', 'red', 'yellow', 'blue', 'green'])).toBe('six')
  })

  it('falls back to available_colors, then accent_color', () => {
    expect(
      capabilitiesToCanvas({ available_colors: ['black', 'white', 'yellow'] }, DITHER).colorMode,
    ).toBe('bwy')
    expect(capabilitiesToCanvas({ accent_color: 'yellow' }, DITHER).colorMode).toBe('bwy')
    expect(capabilitiesToCanvas({ accent_color: 'red' }, DITHER).colorMode).toBe('bwr')
  })

  it('ignores junk field values instead of rejecting the display', () => {
    // Non-quarter rotations are not representable, and an out-of-range colour
    // scheme names no palette: fall back to the canonical defaults rather than
    // refusing a display the host insists exists.
    expect(capabilitiesToCanvas({ rotation_degrees: 45 }, DITHER).rotation).toBe(
      DEFAULT_DISPLAY_CONFIG.rotation,
    )
    expect(capabilitiesToCanvas({ color_scheme: 99 }, DITHER).colorMode).toBe(
      DEFAULT_DISPLAY_CONFIG.colorMode,
    )
  })

  it('normalizes out-of-range rotations into 0..270', () => {
    expect(capabilitiesToCanvas({ rotation_degrees: 360 }, DITHER).rotation).toBe(0)
    expect(capabilitiesToCanvas({ rotation_degrees: 450 }, DITHER).rotation).toBe(90)
    expect(capabilitiesToCanvas({ rotation_degrees: -90 }, DITHER).rotation).toBe(270)
  })

  it('carries the designer-only preview dither mode through unchanged', () => {
    // The one thing that survives adopting a display, because it belongs to no
    // display — exactly as the display-config lock treats it.
    expect(
      capabilitiesToCanvas({ pixel_width: 296, pixel_height: 128 }, DITHER).previewDitherMode,
    ).toBe(DITHER)
    expect(capabilitiesToCanvas({ pixel_width: 296, pixel_height: 128 }, 0).previewDitherMode).toBe(
      0,
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
      DITHER,
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
      DITHER,
    )
    expect(next.paletteOverrides).toEqual({ red: '#C53929' })
  })

  it('leaves the palette canonical when a display measures none', () => {
    // A display with no `color_map` renders the canonical palette — it never
    // inherits the hexes measured on some other panel (ADR-007 parity).
    expect(capabilitiesToCanvas({ rotation_degrees: 90 }, DITHER).paletteOverrides).toBeUndefined()
    expect(capabilitiesToCanvas({}, DITHER).paletteOverrides).toBeUndefined()
  })
})
