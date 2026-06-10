import { describe, expect, it } from 'vitest'
import { readCanvasZoomMode } from '../../../src/ui/preferences/canvasZoom'
import { readShowHiddenHintsPrefs } from '../../../src/ui/preferences/hiddenHints'
import { readSnapGridPrefs } from '../../../src/ui/preferences/snapGrid'
import { readTemplatePreviewEnabled } from '../../../src/ui/preferences/templatePreview'
import { readYamlSelectionCoupling } from '../../../src/ui/preferences/yamlSelectionCoupling'
import {
  DEFAULT_PANEL_HEIGHT_FRACTION,
  MIN_CANVAS_PREVIEW_HEIGHT,
  resolveDefaultPanelHeight,
} from '../../../src/ui/hooks/useResizablePanelHeight'

describe('editor defaults without stored settings', () => {
  it('enables linked yaml/canvas selection', () => {
    expect(readYamlSelectionCoupling()).toBe(true)
  })

  it('enables template preview', () => {
    expect(readTemplatePreviewEnabled()).toBe(true)
  })

  it('enables invisible element overlays', () => {
    expect(readShowHiddenHintsPrefs().enabled).toBe(true)
  })

  it('enables snap-to-grid', () => {
    expect(readSnapGridPrefs().enabled).toBe(true)
  })

  it('defaults canvas zoom to fit', () => {
    expect(readCanvasZoomMode()).toBe('fit')
  })

  it('defaults yaml panel height to half the column', () => {
    const container = { clientHeight: 800 } as HTMLElement
    expect(DEFAULT_PANEL_HEIGHT_FRACTION).toBe(0.5)
    expect(
      resolveDefaultPanelHeight(container, 120, MIN_CANVAS_PREVIEW_HEIGHT, 220),
    ).toBe(400)
  })
})
