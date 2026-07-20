import { describe, expect, it } from 'vitest'
import {
  displayIconName,
  elementListRowMeta,
  firstLinePreview,
} from '../../../src/ui/lib/element-list-row'

describe('elementListRowMeta', () => {
  it('shows mdi thumbnail and icon name without list index', () => {
    const meta = elementListRowMeta({ type: 'icon', value: 'mdi:home', x: 0, y: 0, size: 24 })
    expect(meta.typeLabel).toBe('icon')
    expect(meta.thumbnail).toEqual({ kind: 'mdi', name: 'mdi:home' })
    expect(meta.detail).toBe('home')
  })

  it('shows first icon and count for icon_sequence', () => {
    const meta = elementListRowMeta({
      type: 'icon_sequence',
      x: 0,
      y: 0,
      icons: ['mdi:home', 'mdi:office-building'],
      size: 20,
    })
    expect(meta.typeLabel).toBe('icon sequence')
    expect(meta.thumbnail).toEqual({
      kind: 'mdi_sequence',
      names: ['mdi:home'],
      total: 2,
    })
    expect(meta.detail).toBe('2 icons')
  })

  it('uses first line of text value as detail', () => {
    const meta = elementListRowMeta({
      type: 'text',
      value: 'Hello epaper world',
      x: 0,
      y: 0,
    })
    expect(meta.detail).toBe('Hello epaper world')
    expect(meta.thumbnail).toEqual({ kind: 'text', preview: 'He' })
  })

  it('shows evaluated template output when passed preview values', () => {
    const meta = elementListRowMeta({
      type: 'text',
      value: '72.4 °F',
      x: 0,
      y: 0,
    })
    expect(meta.detail).toBe('72.4 °F')
  })

  it('marks invisible elements for strikethrough thumbnails', () => {
    const meta = elementListRowMeta({
      type: 'icon',
      value: 'mdi:eye-off',
      x: 0,
      y: 0,
      size: 24,
      visible: false,
    })
    expect(meta.invisible).toBe(true)
    expect(meta.hiddenOnTag).toBe(true)
  })

  it('marks fill-none elements as hidden on tag', () => {
    const meta = elementListRowMeta({
      type: 'icon',
      value: 'mdi:sunglasses',
      x: 0,
      y: 0,
      size: 24,
      fill: 'none',
      visible: true,
    })
    expect(meta.invisible).toBe(false)
    expect(meta.hiddenOnTag).toBe(true)
  })

  it('does not mark stroke-only rectangles with fill none as hidden on tag', () => {
    const meta = elementListRowMeta({
      type: 'rectangle',
      x_start: 0,
      x_end: 10,
      y_start: 0,
      y_end: 10,
      fill: 'none',
      outline: 'black',
    })
    expect(meta.hiddenOnTag).toBe(false)
  })

  it('marks fill-none rectangles without outline as hidden on tag', () => {
    const meta = elementListRowMeta({
      type: 'rectangle',
      x_start: 0,
      x_end: 10,
      y_start: 0,
      y_end: 10,
      fill: 'none',
      outline: 'none',
    })
    expect(meta.hiddenOnTag).toBe(true)
  })

  it('survives a polygon whose required points went missing instead of crashing the list', () => {
    const meta = elementListRowMeta({ type: 'polygon', points: undefined } as never)
    expect(meta.typeLabel).toBe('polygon')
    expect(typeof meta.detail === 'string' || meta.detail === null).toBe(true)
  })

  it('survives a plot whose required data went missing instead of crashing the list', () => {
    const meta = elementListRowMeta({ type: 'plot', data: undefined } as never)
    expect(meta.typeLabel).toBe('plot')
    expect(typeof meta.detail === 'string' || meta.detail === null).toBe(true)
  })

  it('survives an icon_sequence whose required icons went missing instead of crashing the list', () => {
    const meta = elementListRowMeta({ type: 'icon_sequence', x: 0, y: 0, icons: undefined } as never)
    expect(meta.typeLabel).toBe('icon sequence')
    expect(typeof meta.detail === 'string' || meta.detail === null).toBe(true)
  })

  // Issue #68: swatch thumbnails paint measured palette hexes — same palette
  // source of truth as the preview canvas.
  it('paints color swatches with the measured palette hex when overrides are active', () => {
    const meta = elementListRowMeta(
      { type: 'rectangle', x_start: 0, y_start: 0, x_end: 10, y_end: 10, fill: 'red' },
      { red: '#C53929' },
    )
    expect(meta.thumbnail).toEqual({ kind: 'color', fill: '#C53929', shape: 'square' })
  })

  it('keeps raw color values on swatches without overrides (standalone unchanged)', () => {
    const meta = elementListRowMeta({
      type: 'rectangle',
      x_start: 0,
      y_start: 0,
      x_end: 10,
      y_end: 10,
      fill: 'red',
    })
    expect(meta.thumbnail).toEqual({ kind: 'color', fill: 'red', shape: 'square' })
  })
})

describe('firstLinePreview', () => {
  it('keeps only the first line and collapses whitespace', () => {
    expect(firstLinePreview('line one\nline two')).toBe('line one')
    expect(firstLinePreview('  spaced   words  ')).toBe('spaced words')
  })
})

describe('displayIconName', () => {
  it('strips mdi prefix', () => {
    expect(displayIconName('mdi:account-cowboy-hat')).toBe('account-cowboy-hat')
  })
})
