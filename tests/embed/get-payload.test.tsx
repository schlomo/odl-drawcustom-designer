/** @vitest-environment jsdom */
import { act } from 'react'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import { mountStandaloneApp } from '../../src/embed/standalone'
import type { MountHandle } from '../../src/embed'
import { parseYamlPayload, serializeYamlPayload } from '../../src/core'

/**
 * `MountHandle.getPayload()` (issue #104, ADR-018): a host reads the current
 * drawcustom YAML directly instead of DOM-scraping the Save button — the
 * upstream OpenDisplay HA integration (PR #100) hung silently doing exactly
 * that when Save was disabled by a YAML error. `getPayload()` must always
 * return exactly what `onSaveRequest` would have delivered at that moment —
 * same serializer, same underlying elements state, never a second source of
 * truth.
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

describe('MountHandle.getPayload()', () => {
  it('matches onSaveRequest via an explicit Save click', async () => {
    const onSaveRequest = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onSaveRequest })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const viaGetPayload = handle.getPayload()

    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton!)

    expect(onSaveRequest).toHaveBeenCalledTimes(1)
    const viaSave = onSaveRequest.mock.calls[0]![0] as string
    expect(viaGetPayload).toBe(viaSave)
    expect(viaGetPayload).toContain('value: Hello')
  })

  it('reflects a setPayload push once the mount has registered it', async () => {
    const onSaveRequest = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onSaveRequest })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const nextPayload = ['- type: text', '  value: Replaced', '  x: 1', '  y: 1', ''].join('\n')
    act(() => handle.setPayload(nextPayload))

    await waitFor(() => {
      expect(handle.getPayload()).toContain('value: Replaced')
    })

    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    fireEvent.click(saveButton!)
    expect(onSaveRequest.mock.calls[0]![0]).toBe(handle.getPayload())
  })

  it('returns the bootstrap payload synchronously, before React has flushed any effect', () => {
    // Deliberately NOT wrapped in act(): the point is to observe the state
    // that exists strictly before React commits and runs passive effects —
    // the registration that backs getPayload() post-mount hasn't run yet.
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    const expected = serializeYamlPayload(parseYamlPayload(PAYLOAD))
    expect(handle.getPayload()).toBe(expected)
  })

  it('never throws and never returns undefined for a standalone handle called immediately', () => {
    const handle = mountStandaloneApp(container)
    handles.push(handle)

    expect(() => handle.getPayload()).not.toThrow()
    expect(handle.getPayload()).not.toBeUndefined()
    expect(typeof handle.getPayload()).toBe('string')
  })

  it('a standalone handle exposes getPayload matching its own Save-equivalent payload once loaded', async () => {
    const handle = mountStandaloneApp(container)
    handles.push(handle)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    expect(typeof handle.getPayload()).toBe('string')
    expect(handle.getPayload().length).toBeGreaterThan(0)
  })

  it('returns the last valid payload while the YAML editor is blocked by an error, never the broken text', async () => {
    const onSaveRequest = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onSaveRequest })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const beforeBreak = handle.getPayload()
    const view = findMountedView()

    // Break the document: delete the `type` colon (same repro shape as
    // tests/ui/components/yaml-panel-blocked-sync.test.tsx).
    const doc = view.state.doc.toString()
    const colonIndex = doc.indexOf(':')
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    // The Save button disables while blocked — the host has no working Save
    // channel at all right now; getPayload() is the only way to read
    // anything, and it must be the last-valid payload, not the broken text.
    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    await waitFor(() => {
      expect(saveButton).toBeDisabled()
    })

    expect(handle.getPayload()).toBe(beforeBreak)
  })

  it('forces a flush of a pending debounced valid edit so getPayload never lags Save', async () => {
    const onSaveRequest = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onSaveRequest })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    expect(valueFrom).toBeGreaterThan(-1)

    // Type a valid edit — the 80ms sync debounce is deliberately left
    // pending (never advance timers, never blur the editor).
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })
    expect(view.state.doc.toString()).toContain('value: Edited')

    // Called synchronously, mid-debounce: must already reflect the typed
    // edit — the upstream contract is "read instead of clicking Save", and a
    // real Save click blurs the editor (flushing the debounce) before it
    // reads `elements`, so getPayload() must match that, not the stale
    // pre-edit committed state. Wrapped in act() so React actually commits
    // the forced flush before the assertions below — a real host call is
    // not itself wrapped in act(), but a genuine Save click always arrives
    // as a separate browser event after React's automatic batching has
    // flushed this update, which act() reproduces here.
    let viaGetPayload!: string
    act(() => {
      viaGetPayload = handle.getPayload()
    })
    expect(viaGetPayload).toContain('value: Edited')

    // Confirm it is bit-for-bit what the real Save channel sends.
    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    fireEvent.click(saveButton!)
    expect(onSaveRequest).toHaveBeenCalledTimes(1)
    expect(onSaveRequest.mock.calls[0]![0]).toBe(viaGetPayload)
  })

  it('throws after destroy(), like every other handle method', () => {
    const handle = mountDesigner({ payload: PAYLOAD })

    act(() => handle.destroy())

    expect(() => handle.getPayload()).toThrow('MountHandle used after destroy()')
  })
})

/**
 * A host `setPayload()` push is authoritative: it replaces the payload
 * wholesale, so any YAML edit still parked in the editor's 80ms debounce is a
 * pre-push draft the host has just overruled. Before the fix, that draft
 * survived the push and was committed by the next flush — and `getPayload()`,
 * documented as a pure read, forces exactly that flush, so a host doing
 * `setPayload(next)` then `getPayload()` deterministically read back the
 * *typed* text instead of the payload it had just pushed.
 */
describe('setPayload push vs. a pending debounced YAML edit', () => {
  async function mountAndTypePendingEdit(): Promise<{ handle: MountHandle; view: EditorView }> {
    const handle = mountDesigner({ payload: PAYLOAD })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    expect(valueFrom).toBeGreaterThan(-1)

    // A valid edit whose 80ms debounce is deliberately left pending — never
    // blurred, timers never advanced.
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })
    expect(view.state.doc.toString()).toContain('value: Edited')

    return { handle, view }
  }

  it('getPayload() right after a push reads the pushed payload, not the pending draft', async () => {
    const { handle } = await mountAndTypePendingEdit()

    act(() => handle.setPayload(PUSHED_PAYLOAD))

    let viaGetPayload!: string
    act(() => {
      viaGetPayload = handle.getPayload()
    })
    expect(viaGetPayload).toContain('value: Pushed')
    expect(viaGetPayload).not.toContain('value: Edited')
  })

  it('the pending debounce cannot resurrect the pre-push draft when it fires', async () => {
    const { handle, view } = await mountAndTypePendingEdit()

    vi.useFakeTimers()
    act(() => handle.setPayload(PUSHED_PAYLOAD))

    // Fire the debounce the push invalidated: nothing may come back.
    act(() => {
      vi.advanceTimersByTime(500)
    })

    let viaGetPayload!: string
    act(() => {
      viaGetPayload = handle.getPayload()
    })
    expect(viaGetPayload).toContain('value: Pushed')
    expect(viaGetPayload).not.toContain('value: Edited')

    // The editor shows the pushed payload too — with the draft invalidated,
    // the external sync is no longer deferred by it.
    expect(view.state.doc.toString()).toContain('value: Pushed')
    expect(view.state.doc.toString()).not.toContain('value: Edited')
  })

  it('the push also reaches Save, so getPayload and the Save channel never disagree', async () => {
    const onSaveRequest = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, onSaveRequest })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const view = findMountedView()
    const doc = view.state.doc.toString()
    const valueFrom = doc.indexOf('value: Hello')
    dispatchUserEdit(view, {
      from: valueFrom,
      to: valueFrom + 'value: Hello'.length,
      insert: 'value: Edited',
    })

    act(() => handle.setPayload(PUSHED_PAYLOAD))

    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    fireEvent.click(saveButton!)
    expect(onSaveRequest).toHaveBeenCalledTimes(1)
    expect(onSaveRequest.mock.calls[0]![0]).toContain('value: Pushed')
    expect(onSaveRequest.mock.calls[0]![0]).toBe(handle.getPayload())
  })
})
