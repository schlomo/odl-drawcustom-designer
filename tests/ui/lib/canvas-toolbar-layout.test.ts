import { describe, expect, it } from 'vitest'
import { CANVAS_TOOLBAR_ITEM_SELECTOR } from '../../../src/ui/lib/canvas-toolbar-layout'

describe('canvas header toolbar layout', () => {
  it('marks toolbar controls for row-wrap detection', () => {
    expect(CANVAS_TOOLBAR_ITEM_SELECTOR).toBe('[data-canvas-toolbar]')
  })
})
