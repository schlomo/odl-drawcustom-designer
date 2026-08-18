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

  it('fires (debounced) on a validity flip, with the transitioned status', async () => {
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
    expect(handle.getStatus().yamlValid).toBe(false)
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
})
