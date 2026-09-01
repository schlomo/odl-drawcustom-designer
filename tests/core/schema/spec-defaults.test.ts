import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core/schema/elements'
import {
  defaultMultilineOffsetY,
  getPropertyEffectiveValue,
  hasPropertyDefault,
  normalizePropertyValueForStorage,
} from '../../../src/core/schema/propertyMetadata'
import { ELEMENT_TYPE_INSERTIONS } from '../../../src/core/schema/elementTemplates'

/**
 * Defaults from docs/spec/supported_types.md — regression guard when metadata drifts.
 */
const SPEC_DEFAULTS: Array<{
  label: string
  element: DrawElement
  property: string
  expected: unknown
}> = [
  { label: 'debug_grid spacing', element: { type: 'debug_grid' }, property: 'spacing', expected: 20 },
  { label: 'debug_grid dashed', element: { type: 'debug_grid' }, property: 'dashed', expected: true },
  { label: 'text size', element: { type: 'text', value: 'Hi', x: 0 }, property: 'size', expected: 20 },
  { label: 'text y_padding', element: { type: 'text', value: 'Hi', x: 0 }, property: 'y_padding', expected: 10 },
  // `multiline` deliberately has no `spacing` default: upstream
  // `draw_multiline` never reads the field, so the designer must not advertise
  // one. `offset_y` carries this element's line spacing and is required.
  { label: 'multiline size', element: { type: 'multiline', value: 'a|b', delimiter: '|', x: 0, offset_y: 10 }, property: 'size', expected: 20 },
  // The two text handlers anchor differently upstream — `draw_text` falls back
  // to `lt`, `draw_multiline` to `lm`. Half a font box apart, so these two
  // rows must never be "tidied" into agreeing.
  { label: 'text anchor', element: { type: 'text', value: 'Hi', x: 0 }, property: 'anchor', expected: 'lt' },
  { label: 'multiline anchor', element: { type: 'multiline', value: 'a|b', delimiter: '|', x: 0, offset_y: 10 }, property: 'anchor', expected: 'lm' },
  { label: 'line y_padding', element: { type: 'line', x_start: 0, x_end: 10 }, property: 'y_padding', expected: 0 },
  { label: 'line dash_length', element: { type: 'line', x_start: 0, x_end: 10 }, property: 'dash_length', expected: 5 },
  { label: 'rectangle fill', element: { type: 'rectangle', x_start: 0, x_end: 10, y_start: 0, y_end: 10 }, property: 'fill', expected: null },
  { label: 'polygon fill', element: { type: 'polygon', points: [[0, 0], [1, 0], [0, 1]] }, property: 'fill', expected: 'none' },
  { label: 'progress_bar fill', element: { type: 'progress_bar', x_start: 0, x_end: 10, y_start: 0, y_end: 5, progress: 50 }, property: 'fill', expected: 'red' },
  { label: 'qrcode boxsize', element: { type: 'qrcode', data: 'x', x: 0, y: 0 }, property: 'boxsize', expected: 2 },
  { label: 'qrcode border', element: { type: 'qrcode', data: 'x', x: 0, y: 0 }, property: 'border', expected: 1 },
  { label: 'plot duration', element: { type: 'plot', data: [{ entity: 'sensor.x' }] }, property: 'duration', expected: 86400 },
  { label: 'plot size', element: { type: 'plot', data: [{ entity: 'sensor.x' }] }, property: 'size', expected: 10 },
  {
    label: 'icon_sequence spacing',
    element: { type: 'icon_sequence', x: 0, y: 0, icons: ['mdi:home'], size: 24 },
    property: 'spacing',
    expected: 6,
  },
]

describe('spec defaults (supported_types.md)', () => {
  it.each(SPEC_DEFAULTS)('$label', ({ element, property, expected }) => {
    expect(getPropertyEffectiveValue(element, property)).toEqual(expected)
  })

  it('omits icon_sequence spacing when it matches size/4', () => {
    const element = {
      type: 'icon_sequence' as const,
      x: 0,
      y: 0,
      icons: ['mdi:home'],
      size: 24,
    }
    expect(normalizePropertyValueForStorage(element, 'spacing', 6)).toBeUndefined()
    expect(normalizePropertyValueForStorage(element, 'spacing', 8)).toBe(8)
  })

  it('does not inherit shared fill=black for rectangle', () => {
    const element = {
      type: 'rectangle' as const,
      x_start: 0,
      x_end: 10,
      y_start: 0,
      y_end: 10,
    }
    expect(getPropertyEffectiveValue(element, 'fill')).toBeNull()
  })
})

/**
 * Maintainer ruling 2026-09-01: a new multiline must come out at `offset_y:
 * 26` for the default size 20 — "to achieve a natural look". Tied to the font
 * size rather than frozen at 26, since a fixed pixel value is wrong at every
 * other size.
 *
 * Purely an authoring default: upstream `draw_multiline` declares
 * `requires=[..., "offset_y"]`, so it demands the field and defines no
 * default we could inherit.
 */
describe('multiline offset_y authoring default', () => {
  function multiline(size?: number): DrawElement {
    return {
      type: 'multiline',
      value: 'a|b',
      delimiter: '|',
      x: 0,
      offset_y: 10,
      ...(size === undefined ? {} : { size }),
    }
  }

  it('is 26 at the default size 20 — the maintainer\'s number', () => {
    expect(defaultMultilineOffsetY(20)).toBe(26)
  })

  it('scales with the font size instead of freezing at 26', () => {
    expect(defaultMultilineOffsetY(10)).toBe(13)
    expect(defaultMultilineOffsetY(16)).toBe(21)
    expect(defaultMultilineOffsetY(40)).toBe(52)
    expect(defaultMultilineOffsetY(64)).toBe(83)
  })

  it('surfaces in the property panel as the effective default, not a blank', () => {
    expect(hasPropertyDefault('multiline', 'offset_y')).toBe(true)

    const withoutOffset = { ...multiline(32) } as Record<string, unknown>
    delete withoutOffset.offset_y
    expect(getPropertyEffectiveValue(withoutOffset as DrawElement, 'offset_y')).toBe(42)
  })

  it('keeps a stored value over the computed default', () => {
    expect(getPropertyEffectiveValue(multiline(20), 'offset_y')).toBe(10)
  })

  it('matches what inserting a multiline element actually writes', () => {
    // The insertion template is plain text, so nothing but this test stops the
    // two from drifting apart.
    const inserted = ELEMENT_TYPE_INSERTIONS.multiline
    const offsetY = /offset_y:\s*(\d+)/.exec(inserted)?.[1]

    expect(Number(offsetY)).toBe(defaultMultilineOffsetY(20))
  })
})
