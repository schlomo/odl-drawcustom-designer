import { describe, expect, it } from 'vitest'
import {
  ICON_DEFAULT_ANCHOR,
  anchorPointFromBox,
  iconSequenceBoxSize,
  oppositeResizeHandleForAnchor,
  resolveAnchoredBox,
  resolveDirection,
  seSizeFromOppositeHandlePointer,
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

describe('anchorPointFromBox', () => {
  it('inverts resolveAnchoredBox for icon anchors', () => {
    const box = resolveAnchoredBox('rm', 30, 240, 30, 30, ICON_DEFAULT_ANCHOR)
    expect(anchorPointFromBox('rm', box, ICON_DEFAULT_ANCHOR)).toEqual({ x: 30, y: 240 })
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

describe('oppositeResizeHandleForAnchor', () => {
  it('maps anchors to the opposite edge or corner handle', () => {
    expect(oppositeResizeHandleForAnchor('la', ICON_DEFAULT_ANCHOR)).toBe('se')
    expect(oppositeResizeHandleForAnchor('lm', ICON_DEFAULT_ANCHOR)).toBe('e')
    expect(oppositeResizeHandleForAnchor('lb', ICON_DEFAULT_ANCHOR)).toBe('ne')
    expect(oppositeResizeHandleForAnchor('ma', ICON_DEFAULT_ANCHOR)).toBe('s')
    expect(oppositeResizeHandleForAnchor('mm', ICON_DEFAULT_ANCHOR)).toBe('se')
    expect(oppositeResizeHandleForAnchor('mb', ICON_DEFAULT_ANCHOR)).toBe('n')
    expect(oppositeResizeHandleForAnchor('ra', ICON_DEFAULT_ANCHOR)).toBe('sw')
    expect(oppositeResizeHandleForAnchor('rm', ICON_DEFAULT_ANCHOR)).toBe('w')
    expect(oppositeResizeHandleForAnchor('rb', ICON_DEFAULT_ANCHOR)).toBe('nw')
  })
})

describe('seSizeFromOppositeHandlePointer', () => {
  it('grows la-anchored squares from the southeast corner', () => {
    const handle = oppositeResizeHandleForAnchor('la', ICON_DEFAULT_ANCHOR)
    const size = seSizeFromOppositeHandlePointer(
      'la',
      10,
      20,
      58,
      68,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      handle,
    )
    expect(size).toBe(48)
  })

  it('grows lm-anchored squares from the east edge', () => {
    const handle = oppositeResizeHandleForAnchor('lm', ICON_DEFAULT_ANCHOR)
    expect(handle).toBe('e')
    const size = seSizeFromOppositeHandlePointer(
      'lm',
      10,
      100,
      60,
      100,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      handle,
    )
    expect(size).toBe(50)
    expect(anchorPointFromBox('lm', resolveAnchoredBox('lm', 10, 100, size, size, ICON_DEFAULT_ANCHOR), ICON_DEFAULT_ANCHOR)).toEqual({
      x: 10,
      y: 100,
    })
  })

  it('keeps mm-anchored icons centered while resizing from se', () => {
    const handle = oppositeResizeHandleForAnchor('mm', ICON_DEFAULT_ANCHOR)
    expect(handle).toBe('se')
    const size = seSizeFromOppositeHandlePointer(
      'mm',
      100,
      100,
      130,
      130,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      handle,
    )
    expect(size).toBe(60)
    expect(anchorPointFromBox('mm', resolveAnchoredBox('mm', 100, 100, size, size, ICON_DEFAULT_ANCHOR), ICON_DEFAULT_ANCHOR)).toEqual({
      x: 100,
      y: 100,
    })
  })

  it('grows rb-anchored squares from the northwest handle', () => {
    const handle = oppositeResizeHandleForAnchor('rb', ICON_DEFAULT_ANCHOR)
    expect(handle).toBe('nw')
    const size = seSizeFromOppositeHandlePointer(
      'rb',
      100,
      100,
      55,
      55,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      handle,
    )
    expect(size).toBe(45)
    expect(anchorPointFromBox('rb', resolveAnchoredBox('rb', 100, 100, size, size, ICON_DEFAULT_ANCHOR), ICON_DEFAULT_ANCHOR)).toEqual({
      x: 100,
      y: 100,
    })
  })

  it('resizes rm-anchored icons from the west edge', () => {
    const handle = oppositeResizeHandleForAnchor('rm', ICON_DEFAULT_ANCHOR)
    expect(handle).toBe('w')
    const size = seSizeFromOppositeHandlePointer(
      'rm',
      100,
      100,
      50,
      100,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      handle,
    )
    expect(size).toBe(50)
    expect(anchorPointFromBox('rm', resolveAnchoredBox('rm', 100, 100, size, size, ICON_DEFAULT_ANCHOR), ICON_DEFAULT_ANCHOR)).toEqual({
      x: 100,
      y: 100,
    })
  })
})
