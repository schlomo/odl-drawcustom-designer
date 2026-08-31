import { describe, expect, it } from 'vitest'
import { displaySpecToCanvas } from '../../src/embed/hostContract'
import { DEFAULT_DISPLAY_CONFIG } from '../../src/ui/preferences/displayConfig'

/**
 * What a display *is*: a {@link HostTarget}'s `display` spec — the
 * designer's own contract for a panel's declaration (pixel/render size,
 * rotation, palette) — maps onto the designer's canvas + tag-palette model.
 * Behavior under test: the canvas config a host observes once the designer is
 * pinned to that display.
 *
 * The mapping resolves from the designer's **canonical defaults** — a display
 * *is* a display, so the same display spec must produce the same canvas
 * whatever preceded them (issue #106 ruling; at 2.0 this is the only base,
 * since the merge-onto-current `capabilities` channel is gone, issue #121).
 * `previewDitherMode` is the sole thing carried in from the current canvas: it
 * belongs to no display.
 */

/** A designer-only preview setting, deliberately unlike the default. */
const DITHER: 0 | 2 = 2

describe('displaySpecToCanvas', () => {
  it('maps a full display spec payload onto canvas size, rotation and palette', () => {
    const next = displaySpecToCanvas(
      {
        pixelWidth: 128,
        pixelHeight: 296,
        rotationDegrees: 90,
        renderWidth: 296,
        renderHeight: 128,
        colorScheme: 0x01,
        accentColor: 'red',
        availableColors: ['black', 'white', 'red'],
        colorMap: { black: '#000000', white: '#ffffff', red: '#ff0000' },
        paletteMeasured: false,
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
    const next = displaySpecToCanvas(
      { pixelWidth: 100, pixelHeight: 200, renderWidth: 296, renderHeight: 128 },
      DITHER,
    )
    expect(next.width).toBe(296)
    expect(next.height).toBe(128)
  })

  it('derives render size from pixel size by swapping at 90/270 degrees', () => {
    const next = displaySpecToCanvas(
      { pixelWidth: 400, pixelHeight: 300, rotationDegrees: 270 },
      DITHER,
    )
    expect(next).toMatchObject({ width: 300, height: 400, rotation: 270 })

    const flat = displaySpecToCanvas(
      { pixelWidth: 400, pixelHeight: 300, rotationDegrees: 180 },
      DITHER,
    )
    expect(flat).toMatchObject({ width: 400, height: 300, rotation: 180 })
  })

  it('resolves what a display does not declare from the canonical defaults', () => {
    // Not from the canvas in front of the user: a display that mentions no size
    // and no palette is not inheriting the previous display's (issue #106
    // ruling — a measured `colorMap` on the wrong panel is silently wrong ink,
    // ADR-007). The old merge-onto-current base died with the `capabilities`
    // channel (issue #121), and with it the rotation-only-push quirk.
    const next = displaySpecToCanvas({}, DITHER)

    expect(next).toEqual({ ...DEFAULT_DISPLAY_CONFIG, previewDitherMode: DITHER })

    const rotatedOnly = displaySpecToCanvas({ rotationDegrees: 90 }, DITHER)
    expect(rotatedOnly).toMatchObject({
      width: DEFAULT_DISPLAY_CONFIG.width,
      height: DEFAULT_DISPLAY_CONFIG.height,
      rotation: 90,
    })
  })

  it('maps Basic Standard colorScheme values onto tag color modes', () => {
    expect(displaySpecToCanvas({ colorScheme: 0x00 }, DITHER).colorMode).toBe('bw')
    expect(displaySpecToCanvas({ colorScheme: 0x01 }, DITHER).colorMode).toBe('bwr')
    expect(displaySpecToCanvas({ colorScheme: 0x02 }, DITHER).colorMode).toBe('bwy')
    expect(displaySpecToCanvas({ colorScheme: 0x03 }, DITHER).colorMode).toBe('four')
    expect(displaySpecToCanvas({ colorScheme: 0x04 }, DITHER).colorMode).toBe('six')
  })

  it('infers the color mode from colorMap palette names when no colorScheme is given', () => {
    const infer = (names: string[]) =>
      displaySpecToCanvas(
        { colorMap: Object.fromEntries(names.map((name) => [name, '#000000'])) },
        DITHER,
      ).colorMode

    expect(infer(['black', 'white'])).toBe('bw')
    expect(infer(['black', 'white', 'red'])).toBe('bwr')
    expect(infer(['black', 'white', 'yellow'])).toBe('bwy')
    expect(infer(['black', 'white', 'red', 'yellow'])).toBe('four')
    expect(infer(['black', 'white', 'red', 'yellow', 'blue', 'green'])).toBe('six')
  })

  it('falls back to availableColors, then accentColor', () => {
    expect(
      displaySpecToCanvas({ availableColors: ['black', 'white', 'yellow'] }, DITHER).colorMode,
    ).toBe('bwy')
    expect(displaySpecToCanvas({ accentColor: 'yellow' }, DITHER).colorMode).toBe('bwy')
    expect(displaySpecToCanvas({ accentColor: 'red' }, DITHER).colorMode).toBe('bwr')
  })

  it('ignores junk field values instead of rejecting the display', () => {
    // Non-quarter rotations are not representable, and an out-of-range colour
    // scheme names no palette: fall back to the canonical defaults rather than
    // refusing a display the host insists exists.
    expect(displaySpecToCanvas({ rotationDegrees: 45 }, DITHER).rotation).toBe(
      DEFAULT_DISPLAY_CONFIG.rotation,
    )
    expect(displaySpecToCanvas({ colorScheme: 99 }, DITHER).colorMode).toBe(
      DEFAULT_DISPLAY_CONFIG.colorMode,
    )
  })

  it('normalizes out-of-range rotations into 0..270', () => {
    expect(displaySpecToCanvas({ rotationDegrees: 360 }, DITHER).rotation).toBe(0)
    expect(displaySpecToCanvas({ rotationDegrees: 450 }, DITHER).rotation).toBe(90)
    expect(displaySpecToCanvas({ rotationDegrees: -90 }, DITHER).rotation).toBe(270)
  })

  it('carries the designer-only preview dither mode through unchanged', () => {
    // The one thing that survives adopting a display, because it belongs to no
    // display — exactly as the display-config lock treats it.
    expect(
      displaySpecToCanvas({ pixelWidth: 296, pixelHeight: 128 }, DITHER).previewDitherMode,
    ).toBe(DITHER)
    expect(displaySpecToCanvas({ pixelWidth: 296, pixelHeight: 128 }, 0).previewDitherMode).toBe(
      0,
    )
  })

  // Issue #68: measured colorMap hexes become the active palette overrides.
  it('adopts measured colorMap hexes as palette overrides', () => {
    const next = displaySpecToCanvas(
      {
        colorScheme: 0x01,
        colorMap: { black: '#000000', white: '#ffffff', red: '#c53929' },
        paletteMeasured: true,
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
    const next = displaySpecToCanvas(
      { colorMap: { red: '#c53929', chartreuse: '#7fff00', yellow: 'nope' } },
      DITHER,
    )
    expect(next.paletteOverrides).toEqual({ red: '#C53929' })
  })

  it('leaves the palette canonical when a display measures none', () => {
    // A display with no `colorMap` renders the canonical palette — it never
    // inherits the hexes measured on some other panel (ADR-007 parity).
    expect(displaySpecToCanvas({ rotationDegrees: 90 }, DITHER).paletteOverrides).toBeUndefined()
    expect(displaySpecToCanvas({}, DITHER).paletteOverrides).toBeUndefined()
  })
})
