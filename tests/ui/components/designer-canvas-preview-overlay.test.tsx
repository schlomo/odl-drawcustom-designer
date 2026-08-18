/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement, RenderContext } from '../../../src/core'
import { DesignerCanvas } from '../../../src/ui/components/DesignerCanvas'
import type { DisplayPreviewView } from '../../../src/ui/hooks/useDisplayPreview'
import { writeCanvasZoomMode } from '../../../src/ui/preferences/canvasZoom'

/**
 * The YAML-error overlay must never paint over a host render (issue #109,
 * maintainer ruling 2026-08-17): preview mode is not an error state, and
 * entering one is refused while the document is broken.
 *
 * Held structurally rather than as a fact about today's wiring — this renders
 * the impossible combination directly (a blocked document *and* an active
 * preview) and demands the host render stands alone.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const CANVAS = { width: 296, height: 128 }
const RENDER_CONTEXT: RenderContext = { ...CANVAS, colorMode: 'bw' }
const RECTANGLE: DrawElement = {
  type: 'rectangle',
  x_start: 10,
  y_start: 10,
  x_end: 60,
  y_end: 40,
  fill: 'black',
}

const viewportRect = () =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600,
    toJSON: () => '',
  }) as DOMRect

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  writeCanvasZoomMode('100')
  Element.prototype.getBoundingClientRect = viewportRect
})

function previewView(overrides: Partial<DisplayPreviewView> = {}): DisplayPreviewView {
  return {
    available: true,
    active: true,
    disabledReason: null,
    toggle: () => {},
    imageUrl: 'blob:host-render',
    loading: false,
    error: null,
    getImageBlob: async () => null,
    ...overrides,
  }
}

function renderCanvas(displayPreview: DisplayPreviewView) {
  return render(
    <DesignerCanvas
      elements={[RECTANGLE]}
      editElements={[RECTANGLE]}
      renderContext={RENDER_CONTEXT}
      selectedIndices={[]}
      assetRevision={0}
      sessionName="test-session"
      allocationSize={{ width: 400, height: 300 }}
      snapGrid={{ enabled: false, size: 10 }}
      showHiddenHints={false}
      onToggleShowHiddenHints={() => {}}
      onSelectElement={() => {}}
      onSelectAllInRect={() => {}}
      onAlignSelection={() => {}}
      onUpdateElement={() => {}}
      onUpdateElementsBatch={() => {}}
      onBringSelectionToFront={() => {}}
      onSendSelectionToBack={() => {}}
      onMoveSelectionLayer={() => {}}
      elementCount={1}
      onDeleteSelected={() => {}}
      onNudgeSelected={() => {}}
      onToggleSnap={() => {}}
      previewDitherMode={0}
      onTogglePreviewDither={() => {}}
      blocked
      blockedVisible
      displayPreview={displayPreview}
    />,
  )
}

describe('the YAML-error overlay and the host display preview (issue #109)', () => {
  it('leaves the host render unexplained by a YAML error, whatever the document state', () => {
    const { container } = renderCanvas(previewView())

    expect(container.querySelector('[data-testid="display-preview-image"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="canvas-blocked-overlay"]')).toBeNull()
    expect(container.textContent).not.toContain('YAML has errors')
  })

  it('still explains the designer’s own canvas when no host render is showing', () => {
    const { container } = renderCanvas(previewView({ active: false, imageUrl: null }))

    expect(container.querySelector('[data-testid="canvas-blocked-overlay"]')).not.toBeNull()
  })
})
