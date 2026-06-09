import { describe, expect, it } from 'vitest'
import { collapsedToolbarTooltip } from '../../../src/ui/lib/toolbar-tooltip'

describe('collapsedToolbarTooltip', () => {
  it('returns the text label when the label is hidden', () => {
    expect(collapsedToolbarTooltip('Copy PNG', false)).toBe('Copy PNG')
    expect(collapsedToolbarTooltip('Snap', false, 'Snap moved elements to the grid')).toBe('Snap')
  })

  it('returns the detailed title when the label is visible', () => {
    expect(collapsedToolbarTooltip('Snap', true, 'Snap moved elements to the grid')).toBe(
      'Snap moved elements to the grid',
    )
  })

  it('falls back to the text label when expanded and no detail is provided', () => {
    expect(collapsedToolbarTooltip('Undo', true)).toBe('Undo')
  })
})
