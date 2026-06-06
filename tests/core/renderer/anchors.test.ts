import { describe, expect, it } from 'vitest'
import {
  ICON_DEFAULT_ANCHOR,
  iconSequenceBoxSize,
  resolveAnchoredBox,
  resolveDirection,
  TEXT_DEFAULT_ANCHOR,
} from '../../../src/core/renderer/anchors'

describe('resolveAnchoredBox', () => {
  it('keeps lt at the anchor point (top-left)', () => {
    expect(resolveAnchoredBox('lt', 10, 20, 40, 24, TEXT_DEFAULT_ANCHOR)).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 24,
    })
  })

  it('centers on mm', () => {
    expect(resolveAnchoredBox('mm', 100, 50, 40, 24, TEXT_DEFAULT_ANCHOR)).toEqual({
      x: 80,
      y: 38,
      width: 40,
      height: 24,
    })
  })

  it('anchors rm to the middle of the right edge', () => {
    expect(resolveAnchoredBox('rm', 30, 240, 30, 30, ICON_DEFAULT_ANCHOR)).toEqual({
      x: 0,
      y: 225,
      width: 30,
      height: 30,
    })
  })

  it('anchors rb to the bottom-right corner', () => {
    expect(resolveAnchoredBox('rb', 800, 480, 100, 20, TEXT_DEFAULT_ANCHOR)).toEqual({
      x: 700,
      y: 460,
      width: 100,
      height: 20,
    })
  })

  it('anchors rs to the baseline on the right edge', () => {
    expect(
      resolveAnchoredBox('rs', 100, 50, 40, 24, TEXT_DEFAULT_ANCHOR, { baselineOffset: 20 }),
    ).toEqual({
      x: 60,
      y: 30,
      width: 40,
      height: 24,
    })
  })

  it('uses type defaults when anchor is omitted', () => {
    expect(resolveAnchoredBox(undefined, 5, 5, 20, 20, ICON_DEFAULT_ANCHOR)).toEqual({
      x: 5,
      y: 5,
      width: 20,
      height: 20,
    })
  })
})

describe('resolveDirection', () => {
  it('returns known directions and defaults for templates', () => {
    expect(resolveDirection('left')).toBe('left')
    expect(resolveDirection("{{ 'up' if x else 'down' }}")).toBe('right')
    expect(resolveDirection(undefined, 'up')).toBe('up')
  })
})

describe('iconSequenceBoxSize', () => {
  it('lays out horizontally for right/left directions', () => {
    expect(iconSequenceBoxSize(24, 3, 8, 'right')).toEqual({ width: 24 + 2 * (24 + 8), height: 24 })
  })
})
