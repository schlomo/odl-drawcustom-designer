import { describe, expect, it } from 'vitest'
import {
  isNumericStringCoordinate,
  isPercentageCoordinate,
  resolveCoordinate,
  TEMPLATE_COORDINATE_PLACEHOLDER,
} from '../../../src/core/renderer/coordinates'
import { isTemplateStoredValue } from '../../../src/core/schema/propertyEditorMeta'

describe('coordinates', () => {
  it('resolves numeric strings like numbers', () => {
    expect(resolveCoordinate('50', 400)).toBe(50)
    expect(isNumericStringCoordinate('50')).toBe(true)
  })

  it('resolves percentage coordinates', () => {
    expect(resolveCoordinate('50%', 400)).toBe(200)
    expect(isPercentageCoordinate('50%')).toBe(true)
  })

  it('returns placeholder for incomplete or templated coordinates without throwing', () => {
    expect(resolveCoordinate('{{ }}', 400)).toBe(TEMPLATE_COORDINATE_PLACEHOLDER)
    expect(resolveCoordinate("{{ states('sensor.x') | float }}", 400)).toBe(
      TEMPLATE_COORDINATE_PLACEHOLDER,
    )
    expect(isTemplateStoredValue('{{ }}')).toBe(true)
    expect(isTemplateStoredValue('not-a-number')).toBe(false)
    expect(resolveCoordinate('not-a-number', 400)).toBe(TEMPLATE_COORDINATE_PLACEHOLDER)
  })
})
