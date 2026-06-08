import { describe, expect, it } from 'vitest'
import { resolvePlotValueRange } from '../../../src/core/renderer/plot-sample-data'

describe('resolvePlotValueRange', () => {
  const samples = [12, 15, 18]

  it('uses explicit low and high when both are set', () => {
    expect(resolvePlotValueRange(10, 20, samples)).toEqual({ low: 10, high: 20 })
  })

  it('anchors high when only low is set', () => {
    const range = resolvePlotValueRange(10, undefined, samples)
    expect(range.low).toBe(10)
    expect(range.high).toBeGreaterThan(18)
  })

  it('anchors low when only high is set', () => {
    const range = resolvePlotValueRange(undefined, 20, samples)
    expect(range.high).toBe(20)
    expect(range.low).toBeLessThan(12)
  })
})
