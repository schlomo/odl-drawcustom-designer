import { describe, expect, it } from 'vitest'
import { attributeValueEquals, coerceAttributeValue } from '../../../src/core/templates'

describe('coerceAttributeValue (attribute type derivation)', () => {
  it('derives booleans (case-insensitive)', () => {
    expect(coerceAttributeValue('true')).toBe(true)
    expect(coerceAttributeValue('false')).toBe(false)
    expect(coerceAttributeValue('False')).toBe(false)
    expect(coerceAttributeValue('TRUE')).toBe(true)
  })

  it('derives null/None from null, none and empty input', () => {
    expect(coerceAttributeValue('null')).toBeNull()
    expect(coerceAttributeValue('none')).toBeNull()
    expect(coerceAttributeValue('None')).toBeNull()
    expect(coerceAttributeValue('')).toBeNull()
    expect(coerceAttributeValue('   ')).toBeNull()
  })

  it('derives integers and floats as numbers', () => {
    expect(coerceAttributeValue('123')).toBe(123)
    expect(coerceAttributeValue('-3')).toBe(-3)
    expect(coerceAttributeValue('1.5')).toBe(1.5)
    expect(coerceAttributeValue('1e3')).toBe(1000)
  })

  it('parses JSON arrays and objects', () => {
    expect(coerceAttributeValue('[1, 2]')).toEqual([1, 2])
    expect(coerceAttributeValue('{"k": 1}')).toEqual({ k: 1 })
  })

  it('keeps non-numeric, non-JSON text as a string', () => {
    expect(coerceAttributeValue('No event')).toBe('No event')
    expect(coerceAttributeValue('1,000')).toBe('1,000')
    expect(coerceAttributeValue('on')).toBe('on')
    // Malformed JSON falls back to the raw string.
    expect(coerceAttributeValue('{not json}')).toBe('{not json}')
  })
})

describe('attributeValueEquals (is_state_attr comparison)', () => {
  it('is type-sensitive for scalars', () => {
    expect(attributeValueEquals(false, false)).toBe(true)
    expect(attributeValueEquals(false, 'false')).toBe(false)
    expect(attributeValueEquals(1, 1)).toBe(true)
    expect(attributeValueEquals(1, '1')).toBe(false)
    expect(attributeValueEquals(null, null)).toBe(true)
    expect(attributeValueEquals(null, false)).toBe(false)
  })

  it('compares arrays and objects structurally', () => {
    expect(attributeValueEquals([1, 2], [1, 2])).toBe(true)
    expect(attributeValueEquals({ k: 1 }, { k: 1 })).toBe(true)
    expect(attributeValueEquals([1, 2], [2, 1])).toBe(false)
  })
})
