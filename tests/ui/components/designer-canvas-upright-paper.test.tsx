/** @vitest-environment jsdom */
import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement, RenderContext } from '../../../src/core'
import { DesignerCanvas } from '../../../src/ui/components/DesignerCanvas'
import { writeCanvasZoomMode } from '../../../src/ui/preferences/canvasZoom'

/**
 * Issue #139: the designer must present the logical drawing surface
 * **upright**, always. Upstream `imagegen` creates the drawing canvas already
 * swapped for a quarter turn, draws the payload upright in it, and rotates
 * only the finished bitmap — so a portrait display is a portrait editing
 * surface with horizontal text, not a landscape stage with the design lying
 * on its side.
 *
 * Asserted here on a portrait logical canvas (480×800): the visible stage is
 * portrait, and a pointer drag moves the element the way the pointer moved.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const CANVAS = { width: 480, height: 800 }
const RENDER_CONTEXT: RenderContext = { ...CANVAS, colorMode: 'bw' }

const scrollportRect = () =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000,
    width: 1000,
    height: 1000,
    toJSON: () => '',
  }) as DOMRect

const paperRect = () =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: CANVAS.width,
    bottom: CANVAS.height,
    width: CANVAS.width,
    height: CANVAS.height,
    toJSON: () => '',
  }) as DOMRect

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  // 100% zoom: the stage is then the paper at native size, so the stage's
  // dimensions read directly as the shape of the editing surface.
  writeCanvasZoomMode('100')
  Element.prototype.setPointerCapture = function setPointerCapture() {}
  Element.prototype.releasePointerCapture = function releasePointerCapture() {}
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return true
  }
  // jsdom has no layout engine: give the paper a 1:1 rect so client pixels are
  // canvas pixels, and the scrollport a rect big enough for the stage to render.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return (this as HTMLElement).hasAttribute('data-canvas-paper') ? paperRect() : scrollportRect()
  }
})

const RECTANGLE: DrawElement = {
  type: 'rectangle',
  x_start: 10,
  y_start: 10,
  x_end: 60,
  y_end: 40,
  fill: 'black',
}

function Harness({ onElements = () => {} }: { onElements?: (elements: DrawElement[]) => void }) {
  const [elements, setElements] = useState<DrawElement[]>([RECTANGLE])
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])

  return (
    <DesignerCanvas
      elements={elements}
      editElements={elements}
      renderContext={RENDER_CONTEXT}
      selectedIndices={selectedIndices}
      assetRevision={0}
      sessionName="test-session"
      allocationSize={{ width: 400, height: 300 }}
      snapGrid={{ enabled: false, size: 10 }}
      showHiddenHints={false}
      onToggleShowHiddenHints={() => {}}
      onSelectElement={(index) => setSelectedIndices(index == null ? [] : [index])}
      onSelectAllInRect={() => {}}
      onAlignSelection={() => {}}
      onUpdateElement={(index, element) => {
        setElements((current) => {
          const next = [...current]
          next[index] = element
          onElements(next)
          return next
        })
      }}
      onUpdateElementsBatch={() => {}}
      onBringSelectionToFront={() => {}}
      onSendSelectionToBack={() => {}}
      onMoveSelectionLayer={() => {}}
      elementCount={elements.length}
      onDeleteSelected={() => {}}
      onNudgeSelected={() => {}}
      onToggleSnap={() => {}}
      previewDitherMode={0}
      onTogglePreviewDither={() => {}}
    />
  )
}

describe('the canvas presents the logical drawing surface upright (issue #139)', () => {
  it('a portrait logical canvas gets a portrait stage the size of the paper', () => {
    const { container } = render(<Harness />)

    const stage = container.querySelector<HTMLElement>('[data-canvas-stage]')
    const paper = container.querySelector<HTMLElement>('[data-canvas-paper]')
    if (!stage || !paper) {
      throw new Error('canvas stage/paper not rendered')
    }

    expect(paper.style.width).toBe('480px')
    expect(paper.style.height).toBe('800px')
    // The stage is the paper's visible envelope: portrait, same shape.
    expect(stage.style.width).toBe('480px')
    expect(stage.style.height).toBe('800px')
    // …and the paper carries no quarter turn: a rotating transform has a
    // non-zero skew/rotation term, which a pure scale never does.
    expect(paper.style.transform).not.toMatch(/rotate|matrix\(\s*0/)
  })

  it('a drag moves the element the way the pointer moved', () => {
    let latest: DrawElement[] = []
    const { container } = render(<Harness onElements={(next) => (latest = next)} />)
    const viewport = container.querySelector<HTMLElement>('[data-testid="canvas-viewport"]')
    if (!viewport) {
      throw new Error('canvas viewport not rendered')
    }

    // Grab the rectangle at (30, 20) and drag +30/+20 client px.
    act(() => {
      fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 30, clientY: 20, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 60, clientY: 40 })
    })
    act(() => {
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 60, clientY: 40 })
    })

    expect(latest[0]).toMatchObject({ x_start: 40, y_start: 30, x_end: 90, y_end: 60 })
  })
})
