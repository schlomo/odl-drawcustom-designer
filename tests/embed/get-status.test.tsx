/** @vitest-environment jsdom */
import { act } from 'react'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import type { DesignerStatus } from '../../src/embed/types'
import { YAML_SELECTION_COUPLING_STORAGE_KEY } from '../../src/ui/preferences/keys'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha (see tests/embed/get-payload.test.tsx).
vi.setConfig({ testTimeout: 30_000 })

/**
 * `MountHandle.getStatus()` / `MountOptions.onStatusChange` (issue #133,
 * ADR-018's observability clause): "is the YAML good, what did the user just
 * do, how much has changed" — a small, frozen, derived snapshot, read on
 * demand or subscribed to for transitions. Not designer internals: no
 * elements, no YAML text.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

// jsdom has no layout engine; CodeMirror's measure pass needs these stubbed
// (same stub as tests/ui/components/yaml-panel-blocked-sync.test.tsx).
const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

const PAYLOAD = ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n')
const PUSHED_PAYLOAD = ['- type: text', '  value: Pushed', '  x: 4', '  y: 4', ''].join('\n')

function payloadWithValue(value: string): string {
  return ['- type: text', `  value: ${value}`, '  x: 4', '  y: 4', ''].join('\n')
}

let container: HTMLElement
const handles: MountHandle[] = []

function mountDesigner(options: Parameters<typeof mount>[1] = {}): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

function findMountedView(): EditorView {
  const editorRoot = container.shadowRoot!.querySelector('.cm-editor')
  if (!editorRoot) {
    throw new Error('CodeMirror .cm-editor root not found — did the designer mount?')
  }
  const view = EditorView.findFromDOM(editorRoot as HTMLElement)
  if (!view) {
    throw new Error('EditorView.findFromDOM returned null')
  }
  return view
}

/** Tag the transaction as a real keystroke — see yaml-panel-blocked-sync.test.tsx. */
function dispatchUserEdit(view: EditorView, changes: { from: number; to: number; insert: string }): void {
  act(() => {
    view.dispatch({
      changes,
      annotations: Transaction.userEvent.of('input'),
    })
  })
}

async function waitForMounted(): Promise<void> {
  await waitFor(() => {
    expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
  })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  handles.length = 0
  // Selection coupling (default on) auto-selects the element under the
  // cursor as soon as the YAML editor mounts, which would make every test's
  // baseline selection non-deterministic (whichever element the cursor
  // happens to land in at doc position 0). Disabled here so the only
  // selection changes observed are the ones each test makes explicitly.
  localStorage.setItem(YAML_SELECTION_COUPLING_STORAGE_KEY, 'false')
  return () => {
    for (const handle of handles.splice(0)) {
      try {
        act(() => handle.destroy())
      } catch {
        // already destroyed by the test
      }
    }
    vi.useRealTimers()
  }
})

describe('MountHandle.getStatus()', () => {
  it('returns a default status before the shell has registered', () => {
    // Deliberately NOT wrapped in act(): the point is to observe the state
    // that exists strictly before React commits and flushes the registration
    // effect — the same "pre-registration window" get-payload.test.tsx pins.
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    expect(handle.getStatus()).toEqual({
      yamlValid: true,
      lastEditAt: null,
      payloadRevision: 0,
      selectedElementCount: 0,
    })
  })

  it('reports the freshly mounted designer as valid, unedited and unselected', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    expect(handle.getStatus()).toEqual({
      yamlValid: true,
      lastEditAt: null,
      payloadRevision: 0,
      selectedElementCount: 0,
    })
  })

  it('bumps payloadRevision on a host setPayload() push but never lastEditAt — a push is not a user edit', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const before = handle.getStatus()
    expect(before.payloadRevision).toBe(0)
    expect(before.lastEditAt).toBeNull()

    act(() => handle.setPayload(PUSHED_PAYLOAD))

    const after = handle.getStatus()
    expect(after.payloadRevision).toBe(before.payloadRevision + 1)
    expect(after.lastEditAt).toBeNull()
  })

  it('bumps both payloadRevision and lastEditAt on a committed user edit', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const before = handle.getStatus()
    expect(before.payloadRevision).toBe(0)
    expect(before.lastEditAt).toBeNull()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    // Flush the YAML editor's own 80ms elements-sync debounce so the edit is
    // committed to the canvas model (`commitElements`), which is what bumps
    // both fields.
    act(() => {
      vi.advanceTimersByTime(200)
    })

    const after = handle.getStatus()
    expect(after.payloadRevision).toBe(before.payloadRevision + 1)
    expect(after.lastEditAt).not.toBeNull()
    expect(typeof after.lastEditAt).toBe('number')
  })

  it('reports selectedElementCount without touching payloadRevision or lastEditAt', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const before = handle.getStatus()
    expect(before.selectedElementCount).toBe(0)

    const row = designer().getAllByTestId('element-list-row')[0]!
    act(() => {
      fireEvent.click(row)
    })

    const after = handle.getStatus()
    expect(after.selectedElementCount).toBe(1)
    expect(after.payloadRevision).toBe(before.payloadRevision)
    expect(after.lastEditAt).toBeNull()
  })

  it('flips yamlValid to false with a yamlErrorSummary when the document breaks, and back when fixed', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    await waitFor(() => {
      expect(handle.getStatus().yamlValid).toBe(false)
    })
    const broken = handle.getStatus()
    expect(typeof broken.yamlErrorSummary).toBe('string')
    expect(broken.yamlErrorSummary!.length).toBeGreaterThan(0)

    dispatchUserEdit(view, { from: colonIndex, to: colonIndex, insert: ':' })

    await waitFor(() => {
      expect(handle.getStatus().yamlValid).toBe(true)
    })
    expect(handle.getStatus().yamlErrorSummary).toBeUndefined()
  })

  it('flushes a pending debounced YAML edit immediately, like getPayload() does (MAJOR 3)', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    // Deliberately NOT advancing timers: the YAML editor's own 80ms
    // elements-sync debounce has not fired yet. getStatus() must still
    // already reflect the edit, the same way getPayload() forces a flush
    // before reading (docs/embedding.md, "getPayload()").
    let status!: DesignerStatus
    act(() => {
      status = handle.getStatus()
    })
    expect(status.payloadRevision).toBe(1)
    expect(status.lastEditAt).not.toBeNull()
  })

  it('agrees with getPayload() about a pending edit — both flush before answering (getPayload first)', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    let payload!: string
    let status!: DesignerStatus
    act(() => {
      payload = handle.getPayload()
      status = handle.getStatus()
    })
    expect(payload).toContain('value: Edited')
    expect(status.payloadRevision).toBe(1)
  })

  it('agrees with getPayload() about a pending edit — both flush before answering (getStatus first)', async () => {
    // Order must not matter — calling getStatus() first must flush exactly
    // the same way `getPayload()` does.
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    let status!: DesignerStatus
    let payload!: string
    act(() => {
      status = handle.getStatus()
      payload = handle.getPayload()
    })
    expect(status.payloadRevision).toBe(1)
    expect(payload).toContain('value: Edited')
  })

  it('truncates yamlErrorSummary to its first line, even for a multi-line parser message (MINOR 4)', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    // Same repro as the yaml-panel-blocked-sync fixture: removing this colon
    // produces a raw js-yaml parse error whose message is multi-line (a
    // caret-diagram pointer at the offending column).
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    await waitFor(() => {
      expect(handle.getStatus().yamlValid).toBe(false)
    })
    const summary = handle.getStatus().yamlErrorSummary!
    expect(summary).not.toContain('\n')
    expect(summary.length).toBeGreaterThan(0)
  })

  it('does not bump payloadRevision for a byte-identical setPayload() push (MINOR 6)', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const before = handle.getStatus()
    act(() => handle.setPayload(PAYLOAD))
    const after = handle.getStatus()

    expect(after.payloadRevision).toBe(before.payloadRevision)
    expect(after.lastEditAt).toBe(before.lastEditAt)
  })

  it('returns a frozen object', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    const status = handle.getStatus()
    expect(Object.isFrozen(status)).toBe(true)
    expect(() => {
      ;(status as { payloadRevision: number }).payloadRevision = 999
    }).toThrow()
    expect(handle.getStatus().payloadRevision).toBe(0)
  })

  it('throws after destroy(), like every other handle method', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitForMounted()

    act(() => handle.destroy())

    expect(() => handle.getStatus()).toThrow('MountHandle used after destroy()')
  })
})

describe('MountOptions.onStatusChange', () => {
  it('does not fire for the initial status observed on mount', async () => {
    const onStatusChange = vi.fn()
    mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('fires (debounced) on a validity flip, delivering exactly what getStatus() reports at that instant', async () => {
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    // Not yet — still inside the debounce window.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onStatusChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    const reported = onStatusChange.mock.calls[0]![0] as DesignerStatus
    expect(reported.yamlValid).toBe(false)
    // Full agreement, not just the one field — issue #133 review BLOCKER 2:
    // the delivered snapshot must be exactly what a getStatus() call would
    // answer at the moment of delivery, not a stale one captured when the
    // debounce was scheduled.
    expect(reported).toEqual(handle.getStatus())
  })

  it('fires on a single committed keystroke, exactly once, reflecting the committed revision', async () => {
    // The scenario the review's BLOCKER 1 named precisely: a single keystroke
    // then silence. The YAML editor's own validity flag updates synchronously
    // on every keystroke (well before its 80ms elements-sync debounce commits
    // the edit), so by the time the edit actually commits, nothing *else*
    // this effect depends on has changed — only `payloadRevision`/`lastEditAt`,
    // read through refs. Without `elements` as an explicit effect dependency
    // this produced zero notifications.
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    act(() => {
      vi.advanceTimersByTime(150)
    })
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    const reported = onStatusChange.mock.calls[0]![0] as DesignerStatus
    expect(reported.payloadRevision).toBe(1)
    expect(reported).toEqual(handle.getStatus())
  })

  it('a flip-flop back to the last-notified baseline inside the debounce window delivers no false notification', async () => {
    // Issue #133 review BLOCKER 2, the exact repro: break the document, then
    // fix it back before the 300ms debounce settles. The buggy version
    // delivered a stale `{ yamlValid: false }` snapshot from the scheduling
    // render (the closed-over `getDesignerStatus`), even though the live
    // document — and a live getStatus() call — already agreed it was valid
    // again; it also poisoned `lastNotifiedStatusRef` with that stale key, so
    // the *next* real invalid flip at the same revision would have been
    // silently suppressed.
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    // Fix it back before the debounce fires.
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex, insert: ':' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).not.toHaveBeenCalled()
    expect(handle.getStatus().yamlValid).toBe(true)
  })

  it('a flip-flop that settles on a different truth than the baseline delivers that live truth, not an intermediate one', async () => {
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    // Break it, wait a bit (still mid-debounce), edit again while still
    // broken (a different broken shape), then let it settle. Whatever fires
    // must match the LIVE document, never an intermediate one from the
    // scheduling render.
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex, insert: 'x' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    const reported = onStatusChange.mock.calls[0]![0] as DesignerStatus
    expect(reported).toEqual(handle.getStatus())
    expect(reported.yamlValid).toBe(false)
  })

  it('does not fire for a selection change alone', async () => {
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const row = designer().getAllByTestId('element-list-row')[0]!
    act(() => {
      fireEvent.click(row)
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(handle.getStatus().selectedElementCount).toBe(1)
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('coalesces a burst of rapid edits into a single call', async () => {
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()

    // A burst of small edits, each well inside the previous one's debounce
    // window — the YAML sync debounce (80ms) and the status debounce (300ms)
    // must each coalesce, not fire once per keystroke.
    for (let i = 0; i < 5; i += 1) {
      const doc = view.state.doc.toString()
      const valueFrom = doc.indexOf('value: ') + 'value: '.length
      const valueTo = doc.indexOf('\n', valueFrom)
      dispatchUserEdit(view, { from: valueFrom, to: valueTo, insert: `Edited${i}` })
      act(() => {
        vi.advanceTimersByTime(100)
      })
    }

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    const reported = onStatusChange.mock.calls[0]![0] as DesignerStatus
    expect(reported.payloadRevision).toBe(handle.getStatus().payloadRevision)
  })

  it('coalesces a burst of rapid host setPayload() pushes into a single call reporting the final live revision', async () => {
    // Driven entirely through the push API, not the YAML editor/CodeMirror
    // pipeline at all — a distinct trigger path from every other test in this
    // file, so this cannot pass by riding along on the YAML editor's own
    // lint-diagnostics identity churn (issue #133 review's characterization
    // of the previous version of this test).
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    for (let i = 0; i < 5; i += 1) {
      act(() => handle.setPayload(payloadWithValue(`Edited${i}`)))
      act(() => {
        vi.advanceTimersByTime(50)
      })
    }
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    const reported = onStatusChange.mock.calls[0]![0] as DesignerStatus
    expect(reported.payloadRevision).toBe(handle.getStatus().payloadRevision)
    expect(reported.payloadRevision).toBeGreaterThanOrEqual(5)
    const payload = handle.getPayload()
    expect(payload).toContain('value: Edited4')
  })

  it('cancels a pending notification on destroy() and never fires afterwards', async () => {
    const onStatusChange = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    // Still mid-debounce when the mount is torn down.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onStatusChange).not.toHaveBeenCalled()

    act(() => handle.destroy())

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('tolerates onStatusChange calling getStatus() and setPayload() back into the handle', async () => {
    const seen: DesignerStatus[] = []
    const onStatusChange = vi.fn((status: DesignerStatus) => {
      seen.push(status)
      // Re-entrant reads/pushes must not throw and must not deadlock.
      expect(() => handle.getStatus()).not.toThrow()
      if (seen.length === 1) {
        handle.setPayload(PUSHED_PAYLOAD)
      }
    })
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    act(() => handle.setPayload(payloadWithValue('First')))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(seen.length).toBeGreaterThanOrEqual(1)

    // The re-entrant setPayload from inside the first callback is itself a
    // real committed change (a different payload) — let its own debounce
    // settle too, and confirm the mount is still perfectly usable.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(() => handle.getStatus()).not.toThrow()
    expect(handle.getPayload()).toContain('value: Pushed')
  })

  it('tolerates onStatusChange calling destroy() back into the handle', async () => {
    const onStatusChange = vi.fn(() => {
      expect(() => handle.destroy()).not.toThrow()
    })
    const handle = mountDesigner({ payload: PAYLOAD, onStatusChange })
    await waitForMounted()

    vi.useFakeTimers()
    const view = findMountedView()
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onStatusChange).toHaveBeenCalledTimes(1)
    expect(() => handle.getStatus()).toThrow('MountHandle used after destroy()')
  })
})
