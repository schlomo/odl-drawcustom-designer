import { describe, expect, it } from 'vitest'
import { DRAW_ELEMENT_TYPES } from '../../../src/core'
import {
  elementToolbarLabelsFit,
  labeledElementToolbarMinWidth,
} from '../../../src/ui/lib/element-toolbar-layout'

describe('element toolbar layout', () => {
  it('requires well over 900px for a single labeled row of all element types', () => {
    const minWidth = labeledElementToolbarMinWidth()
    expect(minWidth).toBeGreaterThan(1050)
    expect(minWidth).toBeLessThan(1300)
    expect(DRAW_ELEMENT_TYPES.length).toBe(16)
  })

  it('hides labels below the computed minimum width', () => {
    const minWidth = labeledElementToolbarMinWidth()
    expect(elementToolbarLabelsFit(minWidth - 1)).toBe(false)
    expect(elementToolbarLabelsFit(minWidth)).toBe(true)
    expect(elementToolbarLabelsFit(900)).toBe(false)
  })
})
