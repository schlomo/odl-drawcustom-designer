import { describe, expect, it } from 'vitest'
import { ELEMENT_TOOLBAR_ITEM_SELECTOR } from '../../../src/ui/lib/element-toolbar-layout'

describe('element toolbar layout', () => {
  it('marks toolbar controls for row-wrap detection', () => {
    expect(ELEMENT_TOOLBAR_ITEM_SELECTOR).toBe('[data-element-toolbar]')
  })
})
