import { describe, expect, it } from 'vitest'
import {
  isAllowNegativeNumberProperty,
  isNonNegativeNumberProperty,
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
})
