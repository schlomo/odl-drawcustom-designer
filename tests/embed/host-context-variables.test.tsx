/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostAction, HostActionContext, HostPreviewContext, MountHandle } from '../../src/embed'
import { DISPLAY_PREVIEW_DEBOUNCE_MS } from '../../src/ui/hooks/useDisplayPreview'

// Full-designer mounts plus the preview's 250ms request debounce exceed
// vitest's 5s default on 2-core CI runners — the documented gotcha.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Shared variables are reported OUT of the designer for rendering (maintainer
 * ruling 2026-10-27): the Load Demo's `{{ 'red' if alert else 'white' }}`
 * circle came out white on a real display because the designer's variables
 * never left the browser — Home Assistant rendered the templates without them.
 * They now ride in the same context objects that already carry `display` and
 * `render`, so a host pre-renders every templated field with them before
 * calling the service, and does the same for `renderPreview`. Still *not* a
 * push channel: nothing here lets a host supply variables. What an embedding
 * host can observe:
 *
 *  - `onAction`'s `context.variables` is the map the Variables editor holds
 *    at that click, as the client-side preview substitutes it;
 *  - a name the payload references but has no stored value arrives as `""`
 *    (the empty row the editor shows);
 *  - a stored variable the payload does not reference is reported too;
 *  - `renderPreview` receives the same map, and is asked again after a
 *    variable edit while the preview shows;
 *  - the context and its `variables` are frozen, fresh per call.
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

/**
 * jsdom performs no layout, so every box measures 0 — and the canvas mounts
 * its zoom stage only once its scrollport has a size. Fake exactly that one
 * box, the same stub `host-preview.test.tsx` uses.
 */
function stubCanvasViewportBox() {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect
  const measure = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    if (this instanceof HTMLElement && this.dataset.testid === 'canvas-viewport') {
      return rect
    }
    return measure.call(this)
  })
}

/** The Load Demo's shape in miniature: a templated text and a variable-driven fill. */
const PAYLOAD = [
  '- type: text',
  '  value: "{{ accent_color }}"',
  '  x: 10',
  '  y: 10',
  '- type: circle',
  '  x: 50',
  '  y: 50',
  '  radius: 10',
  '  fill: "{{ \'red\' if alert else \'white\' }}"',
  '',
].join('\n')

const SEND: HostAction = { id: 'send', label: 'Send to display' }

let container: HTMLElement
const handles: MountHandle[] = []

function mountRaw(options: Parameters<typeof mount>[1] = {}): MountHandle {
  let handle!: MountHandle
  act(() => {
    handle = mount(container, options)
  })
  handles.push(handle)
  return handle
}

/** The designer renders inside the container's shadow root (issue #21). */
function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

function actionButton(name: string): HTMLButtonElement {
  return designer().getByRole('button', { name }) as HTMLButtonElement
}

/** The Variables editor lives in the Simulator tab when no host feeds states. */
function openVariablesEditor(): void {
  fireEvent.click(designer().getByRole('button', { name: 'Simulator' }))
  designer().getByTestId('variables-editor')
}

/** Type a value into a referenced variable's row, as the user does. */
function setVariable(name: string, value: string): void {
  fireEvent.change(designer().getByLabelText(`Value for variable ${name}`), { target: { value } })
}

/** Add a brand-new variable through the editor's adder row. */
function addVariable(name: string, value: string): void {
  fireEvent.click(designer().getByRole('button', { name: 'Add variable' }))
  fireEvent.change(designer().getByLabelText('New variable name'), { target: { value: name } })
  fireEvent.change(designer().getByLabelText('New variable value'), { target: { value } })
  fireEvent.click(designer().getByRole('button', { name: 'Add variable' }))
}

function actionContextOf(call: unknown): HostActionContext {
  return (call as [string, string, HostActionContext])[2]
}

function previewContextOf(call: unknown): HostPreviewContext {
  return (call as [string, HostPreviewContext])[1]
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  stubCanvasViewportBox()
  URL.createObjectURL = vi.fn(() => 'blob:preview/1')
  URL.revokeObjectURL = vi.fn()
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
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('host context carries the shared variables (host-context variables slice)', () => {
  it('reports the values the Variables editor holds at the click', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('alert', 'true')
    setVariable('accent_color', 'red')

    fireEvent.click(actionButton('Send to display'))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({
      alert: true,
      accent_color: 'red',
    })
  })

  it('reports a referenced-but-unset variable as the empty string', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('accent_color', 'red')

    fireEvent.click(actionButton('Send to display'))

    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({
      alert: '',
      accent_color: 'red',
    })
  })

  it('reports a stored variable the payload does not reference', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('alert', 'true')
    setVariable('accent_color', 'red')
    addVariable('footer', 'Hello')

    fireEvent.click(actionButton('Send to display'))

    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({
      alert: true,
      accent_color: 'red',
      footer: 'Hello',
    })
  })

  it('is always present — an empty map with nothing stored and nothing referenced', () => {
    const onAction = vi.fn()
    mountRaw({
      payload: ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n'),
      actions: [SEND],
      onAction,
    })

    fireEvent.click(actionButton('Send to display'))

    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({})
  })

  it('reports the value a same-tick edit just committed, not a stale render closure', () => {
    // Same stale-closure class issue #105's review fixed for `display`: an
    // action fired in the same synchronous dispatch as the edit must see it.
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('accent_color', 'red')
    act(() => {
      setVariable('alert', 'true')
      fireEvent.click(actionButton('Send to display'))
    })

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual({
      alert: true,
      accent_color: 'red',
    })
  })

  it('hands renderPreview the same map, and asks again after a variable edit', async () => {
    const onAction = vi.fn()
    const renderPreview = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction, renderPreview })

    openVariablesEditor()
    setVariable('alert', 'true')
    setVariable('accent_color', 'red')

    fireEvent.click(designer().getByRole('button', { name: 'Display preview' }))
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))
    expect(previewContextOf(renderPreview.mock.calls[0]).variables).toEqual({
      alert: true,
      accent_color: 'red',
    })

    // The Variables editor stays live in preview mode (it is not part of the
    // payload), and an edit re-requests the render with the new map.
    setVariable('accent_color', 'blue')
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2))
    expect(previewContextOf(renderPreview.mock.calls[1]).variables).toEqual({
      alert: true,
      accent_color: 'blue',
    })

    // The action fired in the same state carries exactly what the preview got.
    fireEvent.click(actionButton('Send to display'))
    expect(actionContextOf(onAction.mock.calls[0]).variables).toEqual(
      previewContextOf(renderPreview.mock.calls[1]).variables,
    )
  })

  it('reports the typed values the preview injects — "false" is the boolean false', () => {
    // The Load Demo circle: `{{ 'red' if alert else 'white' }}` is white in
    // the designer for `alert = "false"` (ADR-004 typed variables). A host
    // handed the raw string "false" would render it red — truthy.
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('alert', 'false')
    setVariable('accent_color', 'red')
    addVariable('count', '5')

    fireEvent.click(actionButton('Send to display'))

    const reported = actionContextOf(onAction.mock.calls[0]).variables
    expect(reported).toEqual({ alert: false, accent_color: 'red', count: 5 })
    expect(reported.alert).toBe(false)
    expect(reported.count).toBe(5)
  })

  it('collapses a burst of variable edits into exactly one extra renderPreview request', async () => {
    const renderPreview = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))
    mountRaw({ payload: PAYLOAD, renderPreview })

    openVariablesEditor()
    fireEvent.click(designer().getByRole('button', { name: 'Display preview' }))
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))

    // Three edits well inside one debounce window.
    setVariable('accent_color', 'r')
    setVariable('accent_color', 're')
    setVariable('accent_color', 'red')

    // Assert after a quiet period longer than two debounce windows, so a
    // third request would have had every chance to fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DISPLAY_PREVIEW_DEBOUNCE_MS * 2 + 50))
    })
    expect(renderPreview).toHaveBeenCalledTimes(2)
    expect(previewContextOf(renderPreview.mock.calls[1]).variables).toEqual({
      alert: '',
      accent_color: 'red',
    })
  })

  it('hands over a frozen map on a frozen context, fresh per call', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    openVariablesEditor()
    setVariable('alert', 'true')

    fireEvent.click(actionButton('Send to display'))
    fireEvent.click(actionButton('Send to display'))

    const first = actionContextOf(onAction.mock.calls[0])
    const second = actionContextOf(onAction.mock.calls[1])

    // Guard against vacuous freeze assertions: `Object.isFrozen(undefined)`
    // is `true` by spec, so assert the real value first.
    expect(first.variables).toEqual({ alert: true, accent_color: '' })
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.variables)).toBe(true)
    expect(first.variables).not.toBe(second.variables)
    expect(() => {
      // @ts-expect-error deliberate mutation attempt of a frozen, readonly snapshot
      first.variables.alert = 'false'
    }).toThrow()
  })
})
