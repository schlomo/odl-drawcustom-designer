import { describe, expect, it } from 'vitest'
import {
  getPropertyEffectiveValue,
  getVisibleProperties,
  isRequiredProperty,
  normalizePropertyValueForStorage,
  REQUIRED_PROPERTIES_BY_TYPE,
} from '../../../src/core/schema/propertyMetadata'

describe('propertyMetadata', () => {
  it('marks text value and x as required', () => {
    expect(REQUIRED_PROPERTIES_BY_TYPE.text).toEqual(['value', 'x'])
    expect(isRequiredProperty('text', 'value')).toBe(true)
    expect(isRequiredProperty('text', 'font')).toBe(false)
  })

  it('shows required fields, present optional fields, and fields with spec defaults', () => {
    const element = {
      type: 'text' as const,
      value: '99 °C',
      x: 119,
      y: 9,
      size: 40,
    }
    expect(getVisibleProperties(element)).toEqual([
      'value',
      'x',
      'y',
      'size',
      'font',
      'color',
      'anchor',
      'spacing',
      'stroke_width',
      'stroke_fill',
      'y_padding',
      'visible',
      'parse_colors',
      'truncate',
    ])
  })

  it('omits optional fields without spec defaults when absent from yaml', () => {
    const element = {
      type: 'text' as const,
      value: 'Hello',
      x: 0,
    }
    expect(getVisibleProperties(element)).not.toContain('max_width')
    expect(getVisibleProperties(element)).not.toContain('y')
    expect(getVisibleProperties(element)).toContain('font')
    expect(getVisibleProperties(element)).toContain('color')
    expect(getVisibleProperties(element)).toContain('visible')
  })

  it('resolves effective values from spec defaults', () => {
    const element = {
      type: 'text' as const,
      value: 'Hello',
      x: 0,
    }
    expect(getPropertyEffectiveValue(element, 'font')).toBe('ppb.ttf')
    expect(getPropertyEffectiveValue(element, 'color')).toBe('black')
    expect(getPropertyEffectiveValue(element, 'size')).toBe(20)
    expect(getPropertyEffectiveValue(element, 'visible')).toBe(true)
    expect(getPropertyEffectiveValue(element, 'parse_colors')).toBe(false)
  })

  it('stores only non-default values in yaml', () => {
    const element = {
      type: 'text' as const,
      value: 'Hello',
      x: 0,
    }
    expect(normalizePropertyValueForStorage(element, 'font', 'ppb.ttf')).toBeUndefined()
    expect(normalizePropertyValueForStorage(element, 'color', 'red')).toBe('red')
    expect(normalizePropertyValueForStorage(element, 'size', 20)).toBeUndefined()
    expect(normalizePropertyValueForStorage(element, 'size', 32)).toBe(32)
  })
})
