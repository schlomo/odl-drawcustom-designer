import { describe, expect, it } from 'vitest'
import {
  CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO,
  canvasSelectionToolbarMaxWidth,
} from '../../../src/ui/lib/toolbar-responsive-layout'

describe('toolbar responsive layout', () => {
  it('caps multi-select toolbar at 90% of the canvas section', () => {
    expect(CANVAS_SELECTION_TOOLBAR_MAX_WIDTH_RATIO).toBe(0.9)
    expect(canvasSelectionToolbarMaxWidth(1000)).toBe(900)
    expect(canvasSelectionToolbarMaxWidth(0)).toBe(0)
  })
})
