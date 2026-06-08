import { describe, expect, it } from 'vitest'
import {
  isNumericStringCoordinate,
  isPercentageCoordinate,
  resolveCoordinate,
} from '../../../src/core/renderer/coordinates'

describe('coordinates', () => {
  it('resolves numeric strings like numbers', () => {
    expect(resolveCoordinate('50', 400)).toBe(50)
    expect(isNumericStringCoordinate('50')).toBe(true)
  })

  it('resolves percentage coordinates', () => {
    expect(resolveCoordinate('50%', 400)).toBe(200)
    expect(isPercentageCoordinate('50%')).toBe(true)
  })
})
