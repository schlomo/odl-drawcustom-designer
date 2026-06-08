import { describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core/schema/elements'
import {
  getPropertyEffectiveValue,
  normalizePropertyValueForStorage,
} from '../../../src/core/schema/propertyMetadata'

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
  { label: 'multiline spacing', element: { type: 'multiline', value: 'a|b', delimiter: '|', x: 0, offset_y: 10 }, property: 'spacing', expected: 0 },
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
