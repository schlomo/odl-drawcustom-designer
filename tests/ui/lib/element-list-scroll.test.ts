import { describe, expect, it } from 'vitest'
import {
  primaryElementListIndex,
  shouldScrollListRow,
} from '../../../src/ui/lib/element-list-scroll'

describe('primaryElementListIndex', () => {
  it('returns null when nothing is selected', () => {
    expect(primaryElementListIndex([])).toBeNull()
  })

  it('returns the only index for a single selection', () => {
    expect(primaryElementListIndex([3])).toBe(3)
  })

  it('returns the last (most-recently selected) index on multi-select', () => {
    // Mirrors useProjectState's own selectedIndex definition: the last
    // entry in selectedIndices is the most-recently selected element.
    expect(primaryElementListIndex([2, 5, 1])).toBe(1)
  })
})

describe('shouldScrollListRow', () => {
  it('scrolls when there is a primary selection and no drag in progress', () => {
    expect(shouldScrollListRow(4, null)).toBe(true)
  })

  it('does not scroll when nothing is selected', () => {
    expect(shouldScrollListRow(null, null)).toBe(false)
  })

  it('does not scroll while the user is dragging a row in the list', () => {
    // Mirrors the "don't yank what the user is touching" principle from
    // the YAML-pane scroll wiring (#41) — a drag-reorder in progress must
    // never be interrupted by an unrelated selection-driven scroll.
    expect(shouldScrollListRow(4, 0)).toBe(false)
  })
})
