import { describe, expect, it } from 'vitest'
import { YAML_TOOLBAR_ITEM_SELECTOR } from '../../../src/ui/lib/yaml-toolbar-layout'

describe('YAML header toolbar layout', () => {
  it('marks toolbar controls for row-wrap detection', () => {
    expect(YAML_TOOLBAR_ITEM_SELECTOR).toBe('[data-yaml-toolbar]')
  })
})
