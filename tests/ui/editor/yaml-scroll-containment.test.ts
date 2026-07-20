import { describe, expect, it } from 'vitest'
import {
  computeContainedScrollMove,
  type ScrollRect,
} from '../../../src/ui/editor/yamlScrollContainment'

/**
 * Issue #79: designer-internal scroll-into-view is contained to the editor's
 * own scroller. These tests pin the single-scroller geometry (a port of
 * CodeMirror's scrollRectIntoView math): what the user sees is the scroller
 * moving by exactly the amount that positions the target per strategy — and
 * nothing else, because the ancestor walk (the part that scrolled embed host
 * pages) no longer exists. The end-to-end containment itself is asserted in
 * tests/e2e/embed-host-scroll.spec.ts against the real demo host page.
 */

// Editor scroller viewport: 100 tall, 200 wide, at origin.
const BOUNDING: ScrollRect = { left: 0, top: 0, right: 200, bottom: 100 }

// Default left of 20 keeps fixtures clear of the x 'nearest' margin band
// (a rect flush with the scroller edge is nudged by the margin, same as
// upstream CodeMirror — the browser clamps that at scrollLeft 0).
function rectAt(top: number, height = 10, left = 20, width = 50): ScrollRect {
  return { left, top, right: left + width, bottom: top + height }
}

describe('computeContainedScrollMove', () => {
  it('y center: moves the target line to the vertical middle of the scroller', () => {
    // Line at y 80..90 in a 100-tall scroller: its center (85) must land at
    // the scroller center (50) -> scroll down by 35.
    const { moveY } = computeContainedScrollMove(
      rectAt(80),
      BOUNDING,
      1,
      'nearest',
      'center',
      5,
      24,
      true,
    )
    expect(moveY).toBe(35)
  })

  it('y center: an already-centered target does not move', () => {
    const { moveX, moveY } = computeContainedScrollMove(
      rectAt(45),
      BOUNDING,
      1,
      'nearest',
      'center',
      5,
      24,
      true,
    )
    expect(moveY).toBe(0)
    expect(moveX).toBe(0)
  })

  it('y nearest: a fully visible target does not move at all', () => {
    const { moveX, moveY } = computeContainedScrollMove(
      rectAt(40),
      BOUNDING,
      1,
      'nearest',
      'nearest',
      5,
      5,
      true,
    )
    expect(moveY).toBe(0)
    expect(moveX).toBe(0)
  })

  it('y nearest: a target below the viewport scrolls down just far enough (plus margin)', () => {
    // Bottom edge 130 vs viewport bottom 100 with margin 5 -> +35.
    const { moveY } = computeContainedScrollMove(
      rectAt(120),
      BOUNDING,
      1,
      'nearest',
      'nearest',
      5,
      5,
      true,
    )
    expect(moveY).toBe(35)
  })

  it('y nearest: a target above the viewport scrolls up (negative move)', () => {
    const { moveY } = computeContainedScrollMove(
      rectAt(-30),
      BOUNDING,
      1,
      'nearest',
      'nearest',
      5,
      5,
      true,
    )
    expect(moveY).toBe(-35)
  })

  it('x nearest: a target right of the viewport scrolls right just far enough', () => {
    // Right edge 260 vs viewport right 200 with margin 5 -> +65.
    const { moveX } = computeContainedScrollMove(
      rectAt(40, 10, 210, 50),
      BOUNDING,
      1,
      'nearest',
      'nearest',
      5,
      5,
      true,
    )
    expect(moveX).toBe(65)
  })

  it('y center with a rect taller than the scroller anchors to the side of the head', () => {
    // 200-tall selection in a 100-tall scroller cannot be centered; with
    // side > 0 (head after anchor) the bottom edge wins: 250 - 100 + 24.
    const { moveY } = computeContainedScrollMove(
      rectAt(50, 200),
      BOUNDING,
      1,
      'nearest',
      'center',
      5,
      24,
      true,
    )
    expect(moveY).toBe(174)
  })
})
