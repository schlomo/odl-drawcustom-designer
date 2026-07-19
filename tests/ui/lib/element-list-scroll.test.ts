import { describe, expect, it } from 'vitest'
import {
  primaryElementListIndex,
  shouldScrollListRow,
} from '../../../src/ui/lib/element-list-scroll'

describe('primaryElementListIndex', () => {
  it('returns null when nothing is selected', () => {
    expect(primaryElementListIndex([5], [])).toBeNull()
  })

  it('returns the index on a fresh single selection', () => {
    expect(primaryElementListIndex([], [3])).toBe(3)
  })

  it('returns the new index when the selection is replaced', () => {
    expect(primaryElementListIndex([5], [2])).toBe(2)
  })

  it('returns the newly added index on additive (shift) selection, not the highest', () => {
    // useProjectState numerically sorts additive selections
    // (sortIndices, useProjectState.ts) — selectedIndices does NOT preserve
    // selection order. Starting from [5] and shift-selecting element 2
    // yields [2, 5]; the row to scroll to is 2, the one the user just
    // clicked, not the highest index.
    expect(primaryElementListIndex([5], [2, 5])).toBe(2)
  })

  it('falls back to the last entry when several indices are added at once', () => {
    // Marquee/select-all-in-rect adds many at once — no single "just
    // clicked" row exists, so fall back to the primary the rest of the UI
    // uses (indices[length - 1]: useProjectState.ts selectedIndex,
    // PropertyPanel.tsx primaryIndex).
    expect(primaryElementListIndex([1], [1, 3, 7])).toBe(7)
  })

  it('falls back to the last entry when the selection shrinks (shift-deselect)', () => {
    expect(primaryElementListIndex([2, 5], [2])).toBe(2)
    expect(primaryElementListIndex([2, 5, 8], [2, 8])).toBe(8)
  })

  it('returns null when the selection is unchanged', () => {
    expect(primaryElementListIndex([2, 5], [2, 5])).toBeNull()
  })
})

describe('shouldScrollListRow', () => {
  it('scrolls when there is a target row and no drag in progress', () => {
    expect(shouldScrollListRow(4, null)).toBe(true)
  })

  it('does not scroll when there is no target row', () => {
    expect(shouldScrollListRow(null, null)).toBe(false)
  })

  it('does not scroll while the user is dragging a row in the list', () => {
    // Mirrors the "don't yank what the user is touching" principle from
    // the YAML-pane scroll wiring (#41) — a drag-reorder in progress must
    // never be interrupted by an unrelated selection-driven scroll.
    expect(shouldScrollListRow(4, 0)).toBe(false)
  })
})
