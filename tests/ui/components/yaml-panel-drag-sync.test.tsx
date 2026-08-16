/** @vitest-environment jsdom */
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeYamlPayload, type DrawElement } from '../../../src/core'
import { YamlPanel } from '../../../src/ui/components/YamlPanel'

/**
 * Issue #124, root cause 2: every canvas pointermove committed a new
 * `elements` array, and `YamlPanel` re-serialized the whole payload and
 * replaced the CodeMirror document with it — a full lezer re-parse and
 * re-highlight, ~500 DOM nodes churned, per move. Measured headed on the
 * production build with the demo payload: unlinking the editor dropped the
 * drag from ~24 ms/move to the ~17 ms single-rectangle floor, i.e. this sync
 * was essentially all of the remainder.
 *
 * Observable contract asserted here: while a canvas drag is in flight the
 * editor document does not change at all, and one sync at drag end lands the
 * final geometry. Real `EditorView`, mounted through the real `YamlPanel`
 * (same pattern as yaml-panel-blocked-sync.test.tsx) — the assertion reads
 * the actual CodeMirror document, not a prop stand-in.
 */

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
})

afterEach(() => {
  vi.useRealTimers()
})

/** Rectangle at the drag's start, plus a bystander element. */
const startElements: DrawElement[] = [
  { type: 'rectangle', x_start: 40, y_start: 163, x_end: 190, y_end: 235, fill: 'black' },
  { type: 'text', value: 'bystander', x: 10, y: 10 },
]

/** The dragged rectangle after `steps` pointermoves of +6/+4 canvas px. */
function elementsAfterMoves(steps: number): DrawElement[] {
  return [
    {
      type: 'rectangle',
      x_start: 40 + steps * 6,
      y_start: 163 + steps * 4,
      x_end: 190 + steps * 6,
      y_end: 235 + steps * 4,
      fill: 'black',
    },
    startElements[1]!,
  ]
}

function panelProps(overrides: Partial<React.ComponentProps<typeof YamlPanel>> = {}) {
  return {
    elements: startElements,
    sessionName: 'test-session',
    selectedIndex: 0,
    selectionSource: 'ui' as const,
    onSelectElement: () => {},
    onElementsChange: () => {},
    colorScheme: 'dark' as const,
    containerRef: { current: null },
    canvasDragging: false,
    propertyEditing: false,
    ...overrides,
  }
}

function findMountedView(container: HTMLElement): EditorView {
  const editorRoot = container.querySelector('.cm-editor')
  if (!editorRoot) {
    throw new Error('CodeMirror .cm-editor root not found — did YamlEditor mount?')
  }
  const view = EditorView.findFromDOM(editorRoot as HTMLElement)
  if (!view) {
    throw new Error('EditorView.findFromDOM returned null')
  }
  return view
}

describe('YamlPanel suspends the elements → editor sync for the duration of a canvas drag (issue #124)', () => {
  it('leaves the document untouched per pointermove and syncs the final geometry once at drag end', () => {
    const { container, rerender } = render(<YamlPanel {...panelProps()} />)
    const view = findMountedView(container)

    const beforeDrag = view.state.doc.toString()
    expect(beforeDrag).toBe(serializeYamlPayload(startElements))

    // Pointerdown starts the drag session; elements have not moved yet.
    rerender(<YamlPanel {...panelProps({ canvasDragging: true })} />)

    // Ten pointermoves, each committing a fresh `elements` array — exactly
    // what DesignerCanvas's `onUpdateElement` does per move.
    const MOVES = 10
    const docsDuringDrag: string[] = []
    for (let step = 1; step <= MOVES; step++) {
      rerender(
        <YamlPanel {...panelProps({ canvasDragging: true, elements: elementsAfterMoves(step) })} />,
      )
      docsDuringDrag.push(view.state.doc.toString())
    }
    // Pre-fix: ten distinct documents, one full re-serialize + doc replace
    // (lezer re-parse, re-highlight) each.
    expect(new Set(docsDuringDrag)).toEqual(new Set([beforeDrag]))

    // Pointerup ends the drag with the final geometry already committed.
    const finalElements = elementsAfterMoves(MOVES)
    rerender(<YamlPanel {...panelProps({ canvasDragging: false, elements: finalElements })} />)

    const afterDrag = view.state.doc.toString()
    expect(afterDrag).toBe(serializeYamlPayload(finalElements))
    expect(afterDrag).toContain('x_start: 100')
    expect(afterDrag).toContain('y_start: 203')
  })

  it('shows a payload pushed mid-drag once the gesture ends, dropping a draft typed before the push', () => {
    vi.useFakeTimers()
    const discardPendingRef = { current: null as (() => void) | null }
    const elementsChanges: DrawElement[][] = []
    const { container, rerender } = render(
      <YamlPanel
        {...panelProps({
          discardPendingRef,
          onElementsChange: (next) => elementsChanges.push(next),
        })}
      />,
    )
    const view = findMountedView(container)

    // The user types a valid edit; its 80 ms debounce is still pending.
    const bystanderPos = view.state.doc.toString().indexOf('value: bystander')
    expect(bystanderPos).toBeGreaterThan(-1)
    act(() => {
      view.dispatch({
        changes: {
          from: bystanderPos,
          to: bystanderPos + 'value: bystander'.length,
          insert: 'value: typed-draft',
        },
        annotations: Transaction.userEvent.of('input'),
      })
    })
    expect(view.state.doc.toString()).toContain('typed-draft')

    // A canvas drag starts, and moves the rectangle a few times.
    rerender(<YamlPanel {...panelProps({ discardPendingRef, canvasDragging: true })} />)
    for (let step = 1; step <= 3; step++) {
      rerender(
        <YamlPanel
          {...panelProps({ discardPendingRef, canvasDragging: true, elements: elementsAfterMoves(step) })}
        />,
      )
    }

    // The host pushes a payload mid-gesture. `applyPayload` (useProjectState)
    // invalidates the debounced draft in the same synchronous path, then
    // commits the pushed elements — a push is authoritative (issue #104
    // review), and that must still hold across a drag.
    const pushed: DrawElement[] = [{ type: 'circle', x: 20, y: 20, radius: 8, fill: 'red' }]
    act(() => {
      discardPendingRef.current?.()
    })
    rerender(
      <YamlPanel {...panelProps({ discardPendingRef, canvasDragging: true, elements: pushed })} />,
    )

    // Pointerup: the one drag-end sync writes whatever `elements` is now —
    // the pushed payload, not the dropped draft, not a stale pre-drag doc.
    rerender(
      <YamlPanel {...panelProps({ discardPendingRef, canvasDragging: false, elements: pushed })} />,
    )
    expect(view.state.doc.toString()).toBe(serializeYamlPayload(pushed))

    // The dropped draft must not resurrect through its own timer either.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(view.state.doc.toString()).toBe(serializeYamlPayload(pushed))
    expect(elementsChanges).toEqual([])
  })

  it('syncs the final geometry even when the drag starts right after a YAML flush', () => {
    // A canvas pointerdown blurs the editor, so `flushYamlElementsSync` (which
    // arms the self-echo suppression) commits immediately before the drag
    // starts. This harness exercises that as two sequential `act()` calls
    // (a real batch boundary in React, not a single shared batch) — the
    // suppression must not survive the gesture and swallow the drag-end sync
    // either way, or the editor would keep pre-drag geometry.
    vi.useFakeTimers()
    const flushPendingRef = { current: null as (() => void) | null }
    let committed = startElements
    const { container, rerender } = render(
      <YamlPanel
        {...panelProps({
          flushPendingRef,
          onElementsChange: (next) => {
            committed = next
          },
        })}
      />,
    )
    const view = findMountedView(container)

    const bystanderPos = view.state.doc.toString().indexOf('value: bystander')
    act(() => {
      view.dispatch({
        changes: {
          from: bystanderPos,
          to: bystanderPos + 'value: bystander'.length,
          insert: 'value: flushed',
        },
        annotations: Transaction.userEvent.of('input'),
      })
    })

    // Blur-flush + drag start, one batch.
    act(() => {
      flushPendingRef.current?.()
    })
    expect(committed[1]).toMatchObject({ value: 'flushed' })
    rerender(<YamlPanel {...panelProps({ flushPendingRef, canvasDragging: true, elements: committed })} />)

    const dragged: DrawElement[] = [
      { type: 'rectangle', x_start: 100, y_start: 203, x_end: 250, y_end: 275, fill: 'black' },
      committed[1]!,
    ]
    rerender(<YamlPanel {...panelProps({ flushPendingRef, canvasDragging: true, elements: dragged })} />)
    rerender(<YamlPanel {...panelProps({ flushPendingRef, canvasDragging: false, elements: dragged })} />)

    expect(view.state.doc.toString()).toBe(serializeYamlPayload(dragged))
    expect(view.state.doc.toString()).toContain('x_start: 100')
    expect(view.state.doc.toString()).toContain('value: flushed')
  })

  it('does not mis-attribute a later, unrelated sync to a drag that already ended while the doc was blocked', () => {
    // `dragSuspendedSyncRef` is armed for the whole gesture and read once, by
    // the run that finally performs the deferred sync — but if the drag ends
    // while the live doc is still blocked (broken YAML), that run early-
    // returns *before* reaching the read, and the ref used to stay armed.
    // The next sync — wholly unrelated to any drag — would then read it as
    // if IT were canvas-originated and (with coupling on) wrongly scroll the
    // YAML pane to the linked element.
    const { container, rerender } = render(<YamlPanel {...panelProps({ selectionSource: 'yaml' })} />)
    const view = findMountedView(container)

    // Break the live YAML doc (issue #35 blocked state) without touching
    // `elements` — the parent hasn't gotten a valid parse to commit.
    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.toString().length, insert: '::: not valid yaml [' },
        annotations: Transaction.userEvent.of('input'),
      })
    })

    // A canvas drag starts and moves the rectangle while the doc is broken.
    rerender(<YamlPanel {...panelProps({ selectionSource: 'yaml', canvasDragging: true })} />)
    const dragged = elementsAfterMoves(3)
    rerender(
      <YamlPanel
        {...panelProps({ selectionSource: 'yaml', canvasDragging: true, elements: dragged })}
      />,
    )

    // The drag ends while the doc is STILL blocked — the deferred sync
    // cannot land yet, and must not leave `dragSuspendedSyncRef` armed past
    // this point.
    rerender(
      <YamlPanel
        {...panelProps({ selectionSource: 'yaml', canvasDragging: false, elements: dragged })}
      />,
    )

    // Fix the doc back to exactly what `elements` already holds, so no
    // pending parse is created and the doc unblocks with nothing queued.
    act(() => {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.toString().length,
          insert: serializeYamlPayload(dragged),
        },
        annotations: Transaction.userEvent.of('input'),
      })
    })

    const dispatchSpy = vi.spyOn(view, 'dispatch')

    // A later, unrelated change to `elements` (e.g. a property-panel edit) —
    // nothing to do with the drag above. selectionSource stays 'yaml' and
    // canvasDragging stays false, so this sync has no legitimate
    // canvas-origin signal of its own.
    const unrelated: DrawElement[] = [
      dragged[0]!,
      { type: 'text', value: 'unrelated-edit', x: 10, y: 10 },
    ]
    rerender(
      <YamlPanel
        {...panelProps({ selectionSource: 'yaml', canvasDragging: false, elements: unrelated })}
      />,
    )

    // The sync itself must still land correctly once unblocked...
    expect(view.state.doc.toString()).toBe(serializeYamlPayload(unrelated))

    // ...but it must not carry a scroll-into-view effect: with a stale
    // `dragSuspendedSyncRef` still armed, `YamlPanel` would mis-attribute
    // this sync as canvas-originated and request one. Identify a
    // `scrollLinkedElementIntoView` effect by its `ScrollTarget` payload
    // shape (`range`/`y`), distinct from the unrelated entity-id
    // `Compartment.reconfigure` effects the editor also dispatches on its
    // own 200ms scan timer.
    const scrollDispatches = dispatchSpy.mock.calls.filter(([spec]) => {
      const effects = spec != null && 'effects' in spec ? spec.effects : undefined
      const effectList = Array.isArray(effects) ? effects : effects ? [effects] : []
      return effectList.some(
        (effect) =>
          effect != null &&
          typeof effect === 'object' &&
          'value' in effect &&
          effect.value != null &&
          typeof effect.value === 'object' &&
          'range' in effect.value &&
          'y' in effect.value,
      )
    })
    expect(scrollDispatches).toEqual([])
  })
})
