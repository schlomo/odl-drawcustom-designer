/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostPreviewContext, MountHandle } from '../../src/embed'

// Full-designer mounts plus the preview's 250ms request debounce exceed
// vitest's 5s default on 2-core CI runners.
vi.setConfig({ testTimeout: 30_000 })

/**
 * Preview provider seam (issue #109, ADR-018): a host renders the payload
 * itself — the real server-side render, not another client approximation —
 * and the designer shows it in place of its own preview. What an embedding
 * host and its user can observe:
 *
 *  - a **Display preview** toggle right of the canvas heading, and only when
 *    a provider exists (conditional chrome, like actions and targets);
 *  - the returned image in the canvas area, requested with the payload
 *    `getPayload()` reports and the dither the designer's control holds;
 *  - every edit affordance inert while it shows, and live again on exit;
 *  - Copy PNG / Download PNG carrying the *host* render, not the client one;
 *  - a dither change re-requesting and repainting;
 *  - a superseded slow response discarded rather than painted;
 *  - a rejection stated in the preview area, with no image left behind.
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

const PAYLOAD = ['- type: text', '  value: Hello', '  x: 10', '  y: 10', ''].join('\n')

/** A resolvable/rejectable promise, so a test owns when a render answers. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function pngBlob(marker: string): Blob {
  return new Blob([marker], { type: 'image/png' })
}

let container: HTMLElement
const handles: MountHandle[] = []
/** Which blob each stubbed object URL stands for — jsdom has no real ones. */
let blobsByUrl: Map<string, Blob>

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

function shadow(): HTMLElement {
  return container.shadowRoot as unknown as HTMLElement
}

function previewToggle(): HTMLButtonElement {
  return designer().getByRole('button', { name: 'Display preview' }) as HTMLButtonElement
}

function previewImage(): HTMLImageElement | null {
  return shadow().querySelector('[data-testid="display-preview-image"]')
}

/** The blob currently painted in the canvas area, via the stubbed object URL. */
function previewBlob(): Blob | undefined {
  const src = previewImage()?.getAttribute('src') ?? ''
  return blobsByUrl.get(src)
}

function yamlContentEditable(): string | null {
  return shadow().querySelector('.cm-content')?.getAttribute('contenteditable') ?? null
}

/**
 * jsdom performs no layout, so every box measures 0 — and the canvas mounts its
 * zoom stage (and with it the preview paper) only once its scrollport has a
 * size. Fake exactly that one box: a blanket `getBoundingClientRect` stub sends
 * CodeMirror down measurement paths jsdom cannot serve.
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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  stubCanvasViewportBox()
  blobsByUrl = new Map()
  let urlCounter = 0
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    const url = `blob:preview/${(urlCounter += 1)}`
    blobsByUrl.set(url, blob as Blob)
    return url
  })
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

describe('display preview provider (issue #109)', () => {
  it('renders no Display preview chrome at all when the host supplies no provider', () => {
    mountRaw({ payload: PAYLOAD })

    expect(designer().queryByRole('button', { name: 'Display preview' })).toBeNull()
    expect(previewImage()).toBeNull()
  })

  it('offers the toggle immediately right of the canvas heading', () => {
    mountRaw({ payload: PAYLOAD, renderPreview: async () => pngBlob('flat') })

    const heading = designer().getByTestId('canvas-heading')
    const toggle = previewToggle()
    expect(heading.firstElementChild?.tagName).toBe('H2')
    expect(heading.firstElementChild).toHaveTextContent('Canvas')
    expect(heading.firstElementChild?.nextElementSibling?.contains(toggle)).toBe(true)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the host render, requested with the payload and dither the designer holds', async () => {
    const image = pngBlob('host-render')
    const renderPreview = vi.fn(async () => image)
    const handle = mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())

    await waitFor(() => expect(previewBlob()).toBe(image))
    expect(previewToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(renderPreview).toHaveBeenCalledTimes(1)
    const [payload, context] = renderPreview.mock.calls[0] as unknown as [string, HostPreviewContext]
    expect(payload).toBe(handle.getPayload())
    expect(context.service.dither).toBe(0)
    expect(context.targetId).toBeUndefined()
    // It takes over the canvas paper itself, so it rides the same zoom system
    // the designer's own preview does.
    expect(previewImage()?.closest('[data-canvas-paper]')).not.toBeNull()
  })

  it('makes the designer inert while the host render shows, and editable again on exit', async () => {
    mountRaw({ payload: PAYLOAD, renderPreview: async () => pngBlob('flat') })

    const addText = designer().getByRole('button', { name: 'Add text' })
    const clearAll = designer().getByRole('button', { name: 'Clear all' })
    expect(addText).toBeEnabled()
    expect(clearAll).toBeEnabled()
    expect(yamlContentEditable()).toBe('true')

    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewImage()).not.toBeNull())

    expect(designer().getByRole('button', { name: 'Add text' })).toBeDisabled()
    expect(designer().getByRole('button', { name: 'Clear all' })).toBeDisabled()
    expect(yamlContentEditable()).toBe('false')
    // Zoom, dither and the PNG exports stay live — they act on the preview.
    expect(designer().getByRole('button', { name: 'Copy PNG' })).toBeEnabled()
    expect(designer().getByRole('button', { name: 'Download PNG' })).toBeEnabled()
    expect(designer().getByRole('button', { name: '100%' })).toBeEnabled()
    expect(designer().getByRole('button', { name: 'Dither flat' })).toBeEnabled()

    fireEvent.click(previewToggle())

    expect(previewImage()).toBeNull()
    expect(designer().getByRole('button', { name: 'Add text' })).toBeEnabled()
    expect(designer().getByRole('button', { name: 'Clear all' })).toBeEnabled()
    expect(yamlContentEditable()).toBe('true')
  })

  it('copies the host render, not the designer’s own rasterization', async () => {
    const image = pngBlob('host-render')
    const write = vi.fn(async () => {})
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    mountRaw({ payload: PAYLOAD, renderPreview: async () => image })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewImage()).not.toBeNull())

    fireEvent.click(designer().getByRole('button', { name: 'Copy PNG' }))

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const [[items]] = write.mock.calls as unknown as [[{ items: Record<string, Blob> }[]]]
    expect(items[0]?.items['image/png']).toBe(image)
  })

  it('re-requests the render when the dither control changes', async () => {
    const flat = pngBlob('flat')
    const dithered = pngBlob('dithered')
    const renderPreview = vi.fn(
      async (_payload: string, context: HostPreviewContext) =>
        context.service.dither === 2 ? dithered : flat,
    )
    mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewBlob()).toBe(flat))

    fireEvent.click(designer().getByRole('button', { name: 'Dither flat' }))

    await waitFor(() => expect(previewBlob()).toBe(dithered))
    expect(renderPreview).toHaveBeenCalledTimes(2)
    const [, second] = renderPreview.mock.calls[1] as unknown as [string, HostPreviewContext]
    expect(second.service.dither).toBe(2)
  })

  it('discards a stale response a newer request already superseded', async () => {
    const first = deferred<Blob>()
    const second = deferred<Blob>()
    const answers = [first.promise, second.promise]
    const renderPreview = vi.fn(() => answers.shift() ?? Promise.reject(new Error('no answer')))
    mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))

    fireEvent.click(designer().getByRole('button', { name: 'Dither flat' }))
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2))

    const stale = pngBlob('stale')
    const fresh = pngBlob('fresh')
    // The newer request answers first; the superseded one answers afterwards
    // and must never reach the screen.
    await act(async () => {
      second.resolve(fresh)
    })
    await waitFor(() => expect(previewBlob()).toBe(fresh))

    await act(async () => {
      first.resolve(stale)
    })
    expect(previewBlob()).toBe(fresh)
  })

  it('states the failure in the preview area when the provider rejects', async () => {
    const renderPreview = vi.fn(async () => {
      throw new Error('Display offline')
    })
    mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())

    const error = await waitFor(() => designer().getByTestId('display-preview-error'))
    expect(error).toHaveTextContent('Display offline')
    expect(previewImage()).toBeNull()
  })
})
