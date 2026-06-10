import { describe, expect, it } from 'vitest'
import { readYamlSelectionCoupling } from '../../../src/ui/preferences/yamlSelectionCoupling'
import {
  clampPanelHeight,
  getMaxPanelHeight,
  MIN_CANVAS_PREVIEW_HEIGHT,
  resolveDefaultPanelHeight,
} from '../../../src/ui/hooks/useResizablePanelHeight'

describe('yaml selection coupling preference', () => {
  it('defaults to enabled when unset', () => {
    expect(readYamlSelectionCoupling()).toBe(true)
  })
})

describe('resizable yaml panel bounds', () => {
  it('allows the yaml panel to consume nearly the full column', () => {
    const container = { clientHeight: 800 } as HTMLElement
    expect(getMaxPanelHeight(container, MIN_CANVAS_PREVIEW_HEIGHT, 120)).toBe(728)
    expect(clampPanelHeight(900, container, 120, MIN_CANVAS_PREVIEW_HEIGHT)).toBe(728)
  })

  it('keeps a minimum yaml height', () => {
    const container = { clientHeight: 800 } as HTMLElement
    expect(clampPanelHeight(80, container, 120, MIN_CANVAS_PREVIEW_HEIGHT)).toBe(120)
  })

  it('does not cap height before the column is measured', () => {
    expect(getMaxPanelHeight(null, MIN_CANVAS_PREVIEW_HEIGHT, 120)).toBe(Number.POSITIVE_INFINITY)
  })

  it('uses half the column height when unset', () => {
    const container = { clientHeight: 600 } as HTMLElement
    expect(resolveDefaultPanelHeight(container, 120, MIN_CANVAS_PREVIEW_HEIGHT, 220)).toBe(300)
  })
})
