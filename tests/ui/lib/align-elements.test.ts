import { describe, expect, it } from 'vitest'
import {
  alignDelta,
  alignElementsInUnion,
  unionBounds,
  type ElementAlign,
} from '../../../src/ui/lib/align-elements'
import type { ElementBounds } from '../../../src/ui/lib/primitive-bounds'

describe('unionBounds', () => {
  it('returns null for an empty list', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('wraps multiple bounds', () => {
    expect(
      unionBounds([
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 50, y: 5, width: 20, height: 10 },
      ]),
    ).toEqual({ x: 10, y: 5, width: 60, height: 55 })
  })
})

describe('alignDelta', () => {
  const bounds: ElementBounds = { x: 20, y: 30, width: 40, height: 20 }
  const target: ElementBounds = { x: 0, y: 0, width: 100, height: 100 }

  it.each<[ElementAlign, { dx: number; dy: number }]>([
    ['left', { dx: -20, dy: 0 }],
    ['center', { dx: 10, dy: 0 }],
    ['right', { dx: 40, dy: 0 }],
    ['top', { dx: 0, dy: -30 }],
    ['middle', { dx: 0, dy: 10 }],
    ['bottom', { dx: 0, dy: 50 }],
  ])('aligns %s against union bounds', (align, expected) => {
    expect(alignDelta(bounds, target, align)).toEqual(expected)
  })
})

describe('alignElementsInUnion', () => {
  it('aligns multiple rectangles to the left edge of their union', () => {
    const elements = [
      { type: 'rectangle' as const, x_start: 10, y_start: 10, x_end: 30, y_end: 30 },
      { type: 'rectangle' as const, x_start: 50, y_start: 20, x_end: 80, y_end: 40 },
    ]
    const boundsByIndex = new Map<number, ElementBounds>([
      [0, { x: 10, y: 10, width: 20, height: 20 }],
      [1, { x: 50, y: 20, width: 30, height: 20 }],
    ])

    const next = alignElementsInUnion(elements, [0, 1], boundsByIndex, 'left', {
      width: 200,
      height: 200,
    })

    expect(next[0]).toMatchObject({ x_start: 10, x_end: 30 })
    expect(next[1]).toMatchObject({ x_start: 10, x_end: 40 })
  })

  it('aligns to vertical center without changing horizontal positions', () => {
    const elements = [
      { type: 'icon' as const, value: 'home', x: 10, y: 10, size: 20 },
      { type: 'icon' as const, value: 'home', x: 40, y: 50, size: 20 },
    ]
    const boundsByIndex = new Map<number, ElementBounds>([
      [0, { x: 10, y: 10, width: 20, height: 20 }],
      [1, { x: 40, y: 50, width: 20, height: 20 }],
    ])

    const next = alignElementsInUnion(elements, [0, 1], boundsByIndex, 'middle', {
      width: 200,
      height: 200,
    })

    expect(next[0]).toMatchObject({ x: 10, y: 30 })
    expect(next[1]).toMatchObject({ x: 40, y: 30 })
  })
})
