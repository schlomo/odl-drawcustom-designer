import { describe, expect, it } from 'vitest'
import {
  arcPieSliceBounds,
  buildArcPiePath,
  pointOnArc,
} from '../../../src/core/renderer/arc-geometry'

describe('arc geometry', () => {
  it('converts spec degrees (0° right, 90° down) for arc endpoints', () => {
    const start = pointOnArc(100, 75, 50, 0)
    const end = pointOnArc(100, 75, 50, 90)
    expect(start).toEqual({ x: 150, y: 75 })
    expect(end).toEqual({ x: 100, y: 125 })
  })

  it('builds a quarter pie path from 0° to 90° clockwise', () => {
    const path = buildArcPiePath(100, 75, 50, 0, 90)
    expect(path).toBe('M 100 75 L 150 75 A 50 50 0 0 1 100 125 Z')
  })

  it('fits a 0°–90° pie slice inside its bounds', () => {
    const bounds = arcPieSliceBounds(100, 75, 50, 0, 90, 1)
    const start = pointOnArc(100, 75, 50, 0)
    const end = pointOnArc(100, 75, 50, 90)

    for (const point of [{ x: 100, y: 75 }, start, end]) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.x)
      expect(point.y).toBeGreaterThanOrEqual(bounds.y)
      expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height)
    }

    expect(bounds).toEqual({ x: 99.5, y: 74.5, width: 51, height: 51 })
  })

  it('uses the large arc for clockwise 90° to 0°', () => {
    const path = buildArcPiePath(100, 75, 50, 90, 0)
    expect(path).toContain('A 50 50 0 1 1')
  })
})
