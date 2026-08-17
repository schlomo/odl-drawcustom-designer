/** @vitest-environment jsdom */
import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement, RenderContext } from '../../../src/core'

/**
 * Issue #124, root cause 2 (secondary contributor): `hitTargets` in
 * `DesignerCanvas` was derived from the live `elements` array, so every canvas
 * pointermove re-resolved the hit bounds of EVERY element —
 * `resolveElementHitBounds` re-invokes `safeRenderElement`, which is where
 * most of the opentype glyph-shaping cost in the drag profile came from.
 *
 * Hit targets cannot change while a drag is in flight: the gesture is bound to
 * the element grabbed at pointerdown, and the only thing moving is that
 * element. So they are held at the drag-start snapshot (`frozenElements`, the
 * same freeze that already holds the painted base layers still) and resume
 * tracking `elements` when the gesture ends.
 *
 * Observable contract asserted here: across a scripted drag of one element, no
 * hit bounds are resolved for any OTHER element, and the drag itself still
 * lands the dragged element at its true final position.
 */

const hitBoundsCalls: DrawElement[] = []

vi.mock('../../../src/ui/lib/hidden-element-hints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/ui/lib/hidden-element-hints')>()
  return {
    ...actual,
    resolveElementHitBounds: (element: DrawElement, ctx: RenderContext) => {
      hitBoundsCalls.push(element)
      return actual.resolveElementHitBounds(element, ctx)
    },
  }
})

const { DesignerCanvas } = await import('../../../src/ui/components/DesignerCanvas')

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const CANVAS = { width: 200, height: 100 }
const RENDER_CONTEXT: RenderContext = { ...CANVAS, colorMode: 'bw' }

const zeroRect = () =>
  ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => '' }) as DOMRect

const canvasRect = () =>
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
  hitBoundsCalls.length = 0
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  Element.prototype.setPointerCapture = function setPointerCapture() {}
  Element.prototype.releasePointerCapture = function releasePointerCapture() {}
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return true
  }
  // jsdom has no layout engine: give the canvas paper and its scrollport a
  // 1:1 rect so `clientPointToCanvasCoords` maps client px to canvas px.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const element = this as HTMLElement
    const isCanvasSurface =
      element.hasAttribute('data-canvas-paper') ||
      element.getAttribute('data-testid') === 'canvas-viewport'
    return isCanvasSurface ? canvasRect() : zeroRect()
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

/** A text element — the expensive kind to hit-resolve (opentype shaping). */
const BYSTANDER: DrawElement = { type: 'text', value: 'bystander', x: 120, y: 80 }

function DragHarness({
  onElements = () => {},
  onSelect = () => {},
}: {
  onElements?: (elements: DrawElement[]) => void
  onSelect?: (indices: number[]) => void
}) {
  const [elements, setElements] = useState<DrawElement[]>([RECTANGLE, BYSTANDER])
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
      onSelectElement={(index) => {
        const next = index == null ? [] : [index]
        onSelect(next)
        setSelectedIndices(next)
      }}
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

describe('DesignerCanvas freezes hit targets for the duration of a drag (issue #124)', () => {
  it('resolves no hit bounds for the elements the drag is not moving', () => {
    let latest: DrawElement[] = []
    const { container } = render(<DragHarness onElements={(next) => (latest = next)} />)
    const viewport = container.querySelector<HTMLElement>('[data-testid="canvas-viewport"]')
    if (!viewport) {
      throw new Error('canvas viewport not rendered')
    }

    // Grab the rectangle at (30, 20) — inside it, clear of the text.
    act(() => {
      fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 30, clientY: 20, button: 0 })
    })

    hitBoundsCalls.length = 0
    const MOVES = 10
    for (let step = 1; step <= MOVES; step++) {
      act(() => {
        fireEvent.pointerMove(viewport, {
          pointerId: 1,
          clientX: 30 + step * 6,
          clientY: 20 + step * 4,
        })
      })
    }

    // Pre-fix: hitTargets re-derived from the live `elements` on every move,
    // so the bystander text was re-shaped through safeRenderElement 10 times.
    const bystanderResolves = hitBoundsCalls.filter((element) => element.type === 'text')
    expect(bystanderResolves).toEqual([])

    act(() => {
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 90, clientY: 60 })
    })

    // The gesture itself is unaffected: +60/+40 canvas px, no snap grid.
    expect(latest[0]).toMatchObject({ x_start: 70, y_start: 50, x_end: 120, y_end: 80 })
  })

  it('hit-tests the moved element at its new position once the gesture ends', () => {
    // The freeze must not outlive the gesture: afterwards the rectangle is
    // grabbable where it now is, and no longer where it used to be.
    const selections: number[][] = []
    const { container } = render(<DragHarness onSelect={(indices) => selections.push(indices)} />)
    const viewport = container.querySelector<HTMLElement>('[data-testid="canvas-viewport"]')
    if (!viewport) {
      throw new Error('canvas viewport not rendered')
    }

    // Drag the rectangle (10,10)-(60,40) by +30/+20 -> (40,30)-(90,60).
    act(() => {
      fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 30, clientY: 20, button: 0 })
    })
    act(() => {
      fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 60, clientY: 40 })
    })
    act(() => {
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 60, clientY: 40 })
    })

    selections.length = 0
    // (15,15) was inside the rectangle before the drag, and is empty canvas now.
    act(() => {
      fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 15, clientY: 15, button: 0 })
    })
    act(() => {
      fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 15, clientY: 15 })
    })
    expect(selections.at(-1)).toEqual([])

    // (75,50) is inside the rectangle only at its post-drag position.
    act(() => {
      fireEvent.pointerDown(viewport, { pointerId: 3, clientX: 75, clientY: 50, button: 0 })
    })
    act(() => {
      fireEvent.pointerUp(viewport, { pointerId: 3, clientX: 75, clientY: 50 })
    })
    expect(selections.at(-1)).toEqual([0])
  })
})
