import { describe, expect, it } from 'vitest'
import {
  clampNumberPropertyForElement,
  isAllowNegativeNumberProperty,
  isNonNegativeNumberProperty,
  parseNumberPropertyValue,
  storedPropertyValueUnchanged,
} from '../../../src/ui/lib/property-field-meta'

describe('property number constraints', () => {
  it('allows -1 on plot legend width fields', () => {
    expect(isAllowNegativeNumberProperty('xlegend.width')).toBe(true)
    expect(isAllowNegativeNumberProperty('ylegend.width')).toBe(true)
    expect(isNonNegativeNumberProperty('xlegend.width')).toBe(false)
    expect(isNonNegativeNumberProperty('ylegend.width')).toBe(false)
  })

  it('still clamps generic width fields to non-negative values', () => {
    expect(isNonNegativeNumberProperty('width')).toBe(true)
    expect(isNonNegativeNumberProperty('yaxis.width')).toBe(true)
    expect(isNonNegativeNumberProperty('xaxis.width')).toBe(true)
    expect(isAllowNegativeNumberProperty('yaxis.width')).toBe(false)
  })

  it('clamps debug_grid spacing to the designer minimum', () => {
    expect(
      clampNumberPropertyForElement({ type: 'debug_grid' }, 'spacing', 0),
    ).toBe(8)
    expect(
      clampNumberPropertyForElement({ type: 'debug_grid' }, 'spacing', 30),
    ).toBe(30)
  })

  it('parses arc width without snapping empty draft to the default', () => {
    const arc = {
      type: 'arc' as const,
      x: 0,
      y: 0,
      radius: 10,
      start_angle: 0,
      end_angle: 90,
      width: 3,
    }
    expect(parseNumberPropertyValue(arc, 'width', '30')).toBe(30)
    expect(parseNumberPropertyValue(arc, 'width', '0')).toBe(0)
    expect(parseNumberPropertyValue(arc, 'width', '')).toBeUndefined()
  })

  it('detects unchanged stored property values', () => {
    const arc = {
      type: 'arc' as const,
      x: 0,
      y: 0,
      radius: 10,
      start_angle: 0,
      end_angle: 90,
      width: 3,
    }
    expect(storedPropertyValueUnchanged(arc, 'width', 3)).toBe(true)
    expect(storedPropertyValueUnchanged(arc, 'width', 30)).toBe(false)
    expect(storedPropertyValueUnchanged(arc, 'width', undefined)).toBe(false)
  })
})
