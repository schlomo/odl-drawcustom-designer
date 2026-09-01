/** @vitest-environment jsdom */
import { act } from 'react'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import { isYamlDocBlocked } from '../../src/ui/editor/yamlElementsSync'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * A host payload is an import (ADR-018 seam grammar: a mount option is an
 * initial push). Elements that lean on HA's document-flow cursor get an
 * explicit `0`, so what `getPayload()` hands back is what the canvas shows —
 * the same class of normalization the icon `color`→`fill` merge already
 * applies to every payload that crosses this boundary.
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

const emptyClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

const CURSOR_PAYLOAD = [
  '- type: text',
  '  value: Cursor',
  '  x: 10',
  '- type: line',
  '  x_start: 0',
  '  x_end: 100',
  '- type: multiline',
  '  value: a|b',
  '  delimiter: "|"',
  '  x: 10',
  '  y: 40',
  '  offset_y: 12',
  '  spacing: 4',
  '',
].join('\n')

const EXPLICIT_PAYLOAD = ['- type: text', '  value: Pinned', '  x: 10', '  y: 24', ''].join('\n')

/**
 * The editor-path payload leaves out the `spacing` key on purpose: #178
 * removed `spacing` from the `multiline` schema, so typing it would fail
 * validation, block the editor and make `getPayload()` report the *last valid*
 * payload — which would prove nothing about normalization. This one is
 * schema-valid and merely omits the vertical coordinates.
 */
const TYPED_PAYLOAD = [
  '- type: text',
  '  value: Cursor',
  '  x: 10',
  '- type: line',
  '  x_start: 0',
  '  x_end: 100',
  '',
].join('\n')

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

async function waitForMount(): Promise<void> {
  await waitFor(() => {
    expect(container.shadowRoot!.querySelector('[data-testid="element-list-row"]')).not.toBeNull()
  })
}

function noticeText(): string | null {
  const root = container.shadowRoot!
  const banner = Array.from(root.querySelectorAll('[role="status"]')).find((node) =>
    /Imported design made explicit/i.test(node.textContent ?? ''),
  )
  return banner?.textContent ?? null
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

describe('host payload import', () => {
  it('materializes missing vertical coordinates in the mount payload option', async () => {
    const handle = mountDesigner({ payload: CURSOR_PAYLOAD })
    await waitForMount()

    const payload = handle.getPayload()
    expect(payload).toContain('y: 0')
    expect(payload).toContain('y_start: 0')
    expect(payload).not.toContain('spacing:')
  })

  it('shows the notice inside the embedded mount, not only standalone', async () => {
    mountDesigner({ payload: CURSOR_PAYLOAD })
    await waitForMount()

    await waitFor(() => {
      expect(noticeText()).not.toBeNull()
    })
    expect(noticeText()).toContain('2 elements had no vertical coordinate')
    expect(noticeText()).toMatch(/removed spacing from 1 multiline element/i)
  })

  it('materializes a setPayload() push too', async () => {
    const handle = mountDesigner({ payload: EXPLICIT_PAYLOAD })
    await waitForMount()
    expect(noticeText()).toBeNull()

    act(() => handle.setPayload(CURSOR_PAYLOAD))

    await waitFor(() => {
      expect(handle.getPayload()).toContain('y_start: 0')
    })
    expect(noticeText()).not.toBeNull()
  })

  it('says nothing for an already-explicit host payload', async () => {
    const handle = mountDesigner({ payload: EXPLICIT_PAYLOAD })
    await waitForMount()

    expect(handle.getPayload()).toContain('y: 24')
    expect(noticeText()).toBeNull()
  })

  it('re-importing the same payload is idempotent and silent', async () => {
    const handle = mountDesigner({ payload: CURSOR_PAYLOAD })
    await waitForMount()
    await waitFor(() => {
      expect(noticeText()).not.toBeNull()
    })

    const dismiss = Array.from(container.shadowRoot!.querySelectorAll('button')).find((button) =>
      /dismiss/i.test(button.getAttribute('aria-label') ?? button.textContent ?? ''),
    )
    expect(dismiss).toBeDefined()
    act(() => {
      dismiss!.click()
    })
    await waitFor(() => {
      expect(noticeText()).toBeNull()
    })

    const before = handle.getPayload()
    act(() => handle.setPayload(CURSOR_PAYLOAD))

    await waitFor(() => {
      expect(handle.getPayload()).toBe(before)
    })
    expect(noticeText()).toBeNull()
  })

  it('never rewrites what the user types into the editor', async () => {
    const handle = mountDesigner({ payload: EXPLICIT_PAYLOAD })
    await waitForMount()

    const view = findMountedView()
    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: TYPED_PAYLOAD },
        annotations: Transaction.userEvent.of('input.type'),
      })
    })

    await waitFor(() => {
      expect(handle.getPayload()).toContain('value: Cursor')
    })
    expect(handle.getPayload()).not.toContain('y: 0')
    expect(handle.getPayload()).not.toContain('y_start: 0')
    expect(noticeText()).toBeNull()
  })
})

/**
 * Import normalization meeting PR #180's rescue push. A blocked document
 * disqualifies the dedupe, so a push lands even when the committed elements
 * come out identical — which is exactly where the notice could start lying.
 * The rule: the notice describes the *committed design*, so it is rewritten
 * only when this push actually changed that design.
 */
describe('a host push onto a broken YAML document', () => {
  async function mountAndBreakTheDocument(payload: string): Promise<{
    handle: MountHandle
    view: EditorView
  }> {
    const handle = mountDesigner({ payload })
    await waitForMount()

    const view = findMountedView()
    const colonIndex = view.state.doc.toString().indexOf(':')
    expect(colonIndex).toBeGreaterThan(-1)
    act(() => {
      view.dispatch({
        changes: { from: colonIndex, to: colonIndex + 1, insert: '' },
        annotations: Transaction.userEvent.of('input.type'),
      })
    })
    expect(isYamlDocBlocked(view.state.doc.toString())).toBe(true)

    return { handle, view }
  }

  it('rescues the document AND reports what the rescuing payload needed', async () => {
    const { handle, view } = await mountAndBreakTheDocument(EXPLICIT_PAYLOAD)
    expect(noticeText()).toBeNull()

    act(() => handle.setPayload(CURSOR_PAYLOAD))

    // #180's outcome: the block lifts.
    const recovered = view.state.doc.toString()
    expect(isYamlDocBlocked(recovered)).toBe(false)
    expect(recovered).toContain('y_start: 0')
    // This PR's outcome: the notice names what the new design needed.
    await waitFor(() => {
      expect(noticeText()).not.toBeNull()
    })
    expect(noticeText()).toContain('2 elements had no vertical coordinate')
    expect(handle.getPayload()).not.toContain('spacing:')
  })

  it('does not re-announce a normalization when the rescue changes no element', async () => {
    // The design is already committed normalized, and the notice dismissed.
    const { handle, view } = await mountAndBreakTheDocument(CURSOR_PAYLOAD)
    const dismiss = Array.from(container.shadowRoot!.querySelectorAll('button')).find((button) =>
      /dismiss/i.test(button.getAttribute('aria-label') ?? button.textContent ?? ''),
    )
    act(() => {
      dismiss!.click()
    })
    await waitFor(() => {
      expect(noticeText()).toBeNull()
    })

    // The rescue move: re-send the same raw payload. It normalizes to exactly
    // the committed elements, so only the block makes it land.
    act(() => handle.setPayload(CURSOR_PAYLOAD))

    expect(isYamlDocBlocked(view.state.doc.toString())).toBe(false)
    expect(noticeText()).toBeNull()
  })
})
