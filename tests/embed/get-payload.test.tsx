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
import { isYamlDocBlocked } from '../../src/ui/editor/yamlElementsSync'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * `MountHandle.getPayload()` (issue #104, ADR-018): a host reads the current
 * drawcustom YAML directly instead of scraping the designer's DOM for a button
 * to click — a host that simulated a click hung silently whenever a YAML error
 * had disabled the button. `getPayload()` must always return exactly what a
 * host action receives at that moment — same serializer, same underlying
 * elements state, never a second source of truth.
 *
 * Save is a host action at 2.0 (issue #121), so the comparison channel here is
 * `onAction`: a `{ id: 'save', label: 'Save' }` button, which is all the
 * built-in Save button ever was.
 */

/** The host's own Save button — the designer has none of its own. */
const SAVE_ACTION = [{ id: 'save', label: 'Save' }] as const

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
  it('matches the payload a Save action receives on click', async () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: SAVE_ACTION, onAction })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const viaGetPayload = handle.getPayload()

    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton!)

    expect(onAction).toHaveBeenCalledTimes(1)
    const viaSave = onAction.mock.calls[0]![1] as string
    expect(viaGetPayload).toBe(viaSave)
    expect(viaGetPayload).toContain('value: Hello')
  })

  it('reflects a setPayload push once the mount has registered it', async () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: SAVE_ACTION, onAction })

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
    expect(onAction.mock.calls[0]![1]).toBe(handle.getPayload())
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

  it('a standalone handle exposes getPayload once its own bootstrap has loaded', async () => {
    const handle = mountStandaloneApp(container)
    handles.push(handle)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    expect(typeof handle.getPayload()).toBe('string')
    expect(handle.getPayload().length).toBeGreaterThan(0)
  })

  it('returns the last valid payload while the YAML editor is blocked by an error, never the broken text', async () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: SAVE_ACTION, onAction })

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

    // The Save action disables while blocked — the host has no working save
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

  it('forces a flush of a pending debounced valid edit so getPayload never lags an action', async () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: SAVE_ACTION, onAction })

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
    // edit — the upstream contract is "read instead of clicking a button", and
    // a real action click blurs the editor (flushing the debounce) before it
    // reads `elements`, so getPayload() must match that, not the stale
    // pre-edit committed state. Wrapped in act() so React actually commits
    // the forced flush before the assertions below — a real host call is
    // not itself wrapped in act(), but a genuine click always arrives
    // as a separate browser event after React's automatic batching has
    // flushed this update, which act() reproduces here.
    let viaGetPayload!: string
    act(() => {
      viaGetPayload = handle.getPayload()
    })
    expect(viaGetPayload).toContain('value: Edited')

    // Confirm it is bit-for-bit what the action channel sends.
    const saveButton = Array.from(container.shadowRoot!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save',
    )
    fireEvent.click(saveButton!)
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![1]).toBe(viaGetPayload)
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

  it('the push also reaches the action channel, so the two readings never disagree', async () => {
    const onAction = vi.fn()
    const handle = mountDesigner({ payload: PAYLOAD, actions: SAVE_ACTION, onAction })

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
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![1]).toContain('value: Pushed')
    expect(onAction.mock.calls[0]![1]).toBe(handle.getPayload())
  })
})

/**
 * A `setPayload()` accepted into the pending-push queue during the
 * pre-registration window (before the shell's `registerPushTarget` effect has
 * flushed) is what the drained queue will apply as the designer's payload the
 * moment registration happens. `getPayload()`'s pre-registration fallback
 * must serialize *that*, not the original bootstrap — otherwise
 * `mount(...); handle.setPayload(next); handle.getPayload()` reads stale
 * bootstrap YAML even though `next` is what the designer is about to become.
 * Deliberately not wrapped in `act()`: the point is to observe state strictly
 * before React commits and flushes the registration effect (same rationale
 * as "returns the bootstrap payload synchronously" above).
 */
describe('getPayload() fallback vs. a setPayload queued before registration', () => {
  it('reflects a single pre-registration setPayload, not the original bootstrap', () => {
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    handle.setPayload(PUSHED_PAYLOAD)

    const expected = serializeYamlPayload(parseYamlPayload(PUSHED_PAYLOAD))
    expect(handle.getPayload()).toBe(expected)
  })

  it('last setPayload wins when several are queued before registration', () => {
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    const third = ['- type: text', '  value: Third', '  x: 7', '  y: 7', ''].join('\n')
    handle.setPayload(PAYLOAD)
    handle.setPayload(PUSHED_PAYLOAD)
    handle.setPayload(third)

    const expected = serializeYamlPayload(parseYamlPayload(third))
    expect(handle.getPayload()).toBe(expected)
  })

  it('setPayload immediately followed by destroy() before registration: no leak, no throw weirdness', () => {
    const handle = mount(container, { payload: PAYLOAD })
    handles.push(handle)

    expect(() => handle.setPayload(PUSHED_PAYLOAD)).not.toThrow()
    expect(() => handle.destroy()).not.toThrow()
    expect(() => handle.getPayload()).toThrow('MountHandle used after destroy()')
  })
})

/**
 * A host rescue push onto a BROKEN document (Copilot review, PR #180).
 *
 * While the live YAML fails to parse, `elements` stays frozen at the last
 * valid design — so the payload a host would re-push to rescue the user is,
 * structurally, exactly what `elements` already holds. The `setPayload`
 * dedupe compares against `elements`, found them equal, and returned before
 * arming the external replace, so the obvious host move — "re-send the
 * payload to resync the panel" — was swallowed and the editor stayed broken.
 *
 * A blocked document means the editor and `elements` are NOT in sync, so
 * structural equality of `elements` is not grounds to skip. The dedupe still
 * holds for the normal, non-blocked heartbeat push it exists for.
 */
describe('setPayload push onto a broken YAML document', () => {
  async function mountAndBreakTheDocument(): Promise<{ handle: MountHandle; view: EditorView }> {
    const handle = mountDesigner({ payload: PAYLOAD })

    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    const view = findMountedView()
    const colonIndex = view.state.doc.toString().indexOf(':')
    expect(colonIndex).toBeGreaterThan(-1)
    dispatchUserEdit(view, { from: colonIndex, to: colonIndex + 1, insert: '' })

    // Really unparseable, and `elements` really frozen at the last valid design.
    expect(isYamlDocBlocked(view.state.doc.toString())).toBe(true)
    let frozen!: string
    act(() => {
      frozen = handle.getPayload()
    })
    expect(frozen).toContain('value: Hello')

    return { handle, view }
  }

  it('a re-push of the identical payload still rescues the editor', async () => {
    const { handle, view } = await mountAndBreakTheDocument()

    // The rescue move: the host re-sends what it believes the payload is,
    // which is structurally identical to the frozen `elements`.
    act(() => handle.setPayload(PAYLOAD))

    // The recovery outcome: the broken text is gone and the document parses.
    const recovered = view.state.doc.toString()
    expect(isYamlDocBlocked(recovered)).toBe(false)
    expect(recovered).toBe(serializeYamlPayload(parseYamlPayload(PAYLOAD)))
  })

  it('a push carrying different elements also rescues the editor', async () => {
    const { handle, view } = await mountAndBreakTheDocument()

    act(() => handle.setPayload(PUSHED_PAYLOAD))

    const recovered = view.state.doc.toString()
    expect(isYamlDocBlocked(recovered)).toBe(false)
    expect(recovered).toContain('value: Pushed')
  })

  /**
   * The dedupe is load-bearing for the case it was written for and must not
   * be weakened by the fix: on a VALID document an identical re-push is still
   * a full no-op — no revision bump, no cleared selection.
   */
  it('still dedupes an identical re-push on a valid document', async () => {
    const handle = mountDesigner({ payload: PAYLOAD })
    await waitFor(() => {
      expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
    })

    let before!: number
    act(() => {
      before = handle.getStatus().payloadRevision
    })

    act(() => handle.setPayload(PAYLOAD))

    let after!: number
    act(() => {
      after = handle.getStatus().payloadRevision
    })
    expect(after).toBe(before)
  })
})
