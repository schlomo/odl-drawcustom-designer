import { describe, expect, it } from 'vitest'
import { applyAxisDelta, roundCoordinate, translateElement } from '../../../src/ui/lib/element-geometry'

describe('roundCoordinate', () => {
  it('rounds drag deltas to whole pixels', () => {
    expect(applyAxisDelta(10.4, 2.3)).toBe(13)
    expect(roundCoordinate(10.6)).toBe(11)
  })

  it('rounds translated element coordinates', () => {
    const moved = translateElement(
      { type: 'icon', value: 'home', x: 10.2, y: 20.7, size: 24 },
      3.4,
      2.1,
    )
    expect(moved).toMatchObject({ x: 14, y: 23 })
  })
})
