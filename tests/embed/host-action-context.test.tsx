/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostAction, HostActionContext, HostPreviewContext, MountHandle } from '../../src/embed'

// Full-designer mounts under parallel load exceed vitest's 5s default on
// 2-core CI runners — the documented gotcha, not a slow test.
vi.setConfig({ testTimeout: 30_000 })

/**
 * WYSIWYG-send slice of issue #105 (maintainer ruling 2026-08-31): a host
 * action handler must receive the same live `display`/`render` state a
 * `renderPreview` request would carry at that instant — never a value
 * remembered from the last preview render. What an embedding host can
 * observe:
 *
 *  - `context.display` matches the current orientation control, with no
 *    preview provider involved anywhere;
 *  - `context.render.dither` matches the current dither control;
 *  - the shape is identical to what `renderPreview` receives in the same
 *    state — one type, not a fork;
 *  - the context is a fresh, frozen snapshot on every call.
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

const PAYLOAD = ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n')

/** The designer's own default surface, since these mounts push no display. */
const DEFAULT_SURFACE = { width: 384, height: 184 }

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

/** The orientation buttons in the display config panel. */
function clickRotation(degrees: number): void {
  fireEvent.click(designer().getByRole('button', { name: `${degrees}°` }))
}

/** The dither control in the canvas header toolbar — no preview needed. */
function clickDitherToggle(): void {
  const flat = designer().queryByRole('button', { name: 'Dither flat' })
  fireEvent.click(flat ?? designer().getByRole('button', { name: 'Dither d=2' }))
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

describe('host action context carries live display/render state (issue #105 WYSIWYG-send)', () => {
  it('reports the current orientation with no preview provider involved anywhere', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    fireEvent.click(actionButton('Send to display'))
    expect(actionContextOf(onAction.mock.calls[0]).display).toEqual({
      width: DEFAULT_SURFACE.width,
      height: DEFAULT_SURFACE.height,
      rotation: 0,
    })

    // Flip orientation, then invoke the action again — no renderPreview was
    // ever supplied to this mount, so there is nothing to be "sticky" from.
    clickRotation(90)
    fireEvent.click(actionButton('Send to display'))

    expect(actionContextOf(onAction.mock.calls[1]).display).toEqual({
      width: DEFAULT_SURFACE.height,
      height: DEFAULT_SURFACE.width,
      rotation: 90,
    })
  })

  it('reports the current dither control value', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    fireEvent.click(actionButton('Send to display'))
    expect(actionContextOf(onAction.mock.calls[0]).render).toEqual({ dither: 0 })

    clickDitherToggle()
    fireEvent.click(actionButton('Send to display'))

    expect(actionContextOf(onAction.mock.calls[1]).render).toEqual({ dither: 2 })
  })

  it('matches exactly what renderPreview receives in the same state — one shape, not a fork', async () => {
    const onAction = vi.fn()
    const renderPreview = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction, renderPreview })

    clickRotation(90)
    clickDitherToggle()

    fireEvent.click(designer().getByRole('button', { name: 'Display preview' }))
    await vi.waitFor(() => expect(renderPreview).toHaveBeenCalled())
    const preview = previewContextOf(renderPreview.mock.calls[0])

    // Leave preview mode so the Send action is not blocked by mutation-lock.
    fireEvent.click(designer().getByRole('button', { name: 'Display preview' }))
    fireEvent.click(actionButton('Send to display'))
    const action = actionContextOf(onAction.mock.calls[0])

    expect(action.display).toEqual(preview.display)
    expect(action.render).toEqual(preview.render)
  })

  it('hands over a frozen, independent snapshot on every call', () => {
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    fireEvent.click(actionButton('Send to display'))
    fireEvent.click(actionButton('Send to display'))

    const first = actionContextOf(onAction.mock.calls[0])
    const second = actionContextOf(onAction.mock.calls[1])

    // Guard against the freeze assertions below passing vacuously: an absent
    // `display`/`render` (the pre-#105 context shape) would make
    // `Object.isFrozen` trivially `true` (it reports `true` for `undefined`
    // by spec) and the mutation attempt below would throw for the unrelated
    // reason of writing a property onto `undefined` — neither would actually
    // exercise this test's claim. Assert the real, current values first.
    expect(first.display).toEqual({
      width: DEFAULT_SURFACE.width,
      height: DEFAULT_SURFACE.height,
      rotation: 0,
    })
    expect(first.render).toEqual({ dither: 0 })

    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.display)).toBe(true)
    expect(Object.isFrozen(first.render)).toBe(true)
    expect(first).not.toBe(second)
    expect(() => {
      // @ts-expect-error deliberate mutation attempt of a frozen, readonly snapshot
      first.render.dither = 2
    }).toThrow()
  })

  it('reports the rotation a same-tick setRotation call just committed, not a stale render closure', () => {
    // Field evidence (#105 review): a `useCallback`/`useMemo` closing over
    // `canvas` still holds the *previous* render's geometry for any
    // `onAction` fired in the same synchronous dispatch as a
    // `setRotation`/`setCanvasSize` call — batching both DOM events inside
    // one `act()` reproduces that without ever letting React re-render
    // between them, the same class of stale-closure bug `elementsRef`/
    // `getElementsSnapshot` fixed for `getPayload()` (issue #104).
    const onAction = vi.fn()
    mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    act(() => {
      fireEvent.click(designer().getByRole('button', { name: '90°' }))
      fireEvent.click(actionButton('Send to display'))
    })

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(actionContextOf(onAction.mock.calls[0]).display).toEqual({
      width: DEFAULT_SURFACE.height,
      height: DEFAULT_SURFACE.width,
      rotation: 90,
    })
  })

  it('addresses a same-tick display push to the display it just adopted, not to nobody', () => {
    // The context must be internally consistent: `display` and `targetId`
    // describe the *same* panel at the same instant. A one-element
    // `setTargets` push is adopted and locked with no pick (issue #121), so
    // an action fired in the same synchronous dispatch as that push must
    // report both the new panel's geometry *and* its id — reporting the new
    // geometry addressed to no target at all is the exact staleness class
    // this slice exists to remove, and a host would send the right pixels to
    // the wrong place (or to nowhere).
    const onAction = vi.fn()
    const handle = mountRaw({ payload: PAYLOAD, actions: [SEND], onAction })

    act(() => {
      handle.setTargets([
        {
          id: 'display.probe',
          label: 'Probe panel',
          display: { render_width: 800, render_height: 480, rotation_degrees: 90 },
        },
      ])
      fireEvent.click(actionButton('Send to display'))
    })

    expect(onAction).toHaveBeenCalledTimes(1)
    const context = actionContextOf(onAction.mock.calls[0])
    expect(context.display).toEqual({ width: 800, height: 480, rotation: 90 })
    expect(context.targetId).toBe('display.probe')
  })
})
