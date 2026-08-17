/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { Transaction } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { HostPreviewContext, HostTarget, MountHandle } from '../../src/embed'

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
 *  - a rejection stated in the preview area, with no image left behind;
 *  - the toggle refusing to enter a preview of a broken document, and that
 *    document staying unbreakable once inside;
 *  - the canvas geometry travelling with every request, and a re-orientation
 *    asking for a render of the new surface.
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
const PUSHED_PAYLOAD = ['- type: text', '  value: Pushed', '  x: 4', '  y: 4', ''].join('\n')
/** Unparseable on purpose — a host push of it must throw, not land. */
const BROKEN_PAYLOAD = ['- type: text', '  value: "unterminated', '  x: 1', ''].join('\n')

/** The designer's own default surface, since these mounts push no display. */
const DEFAULT_SURFACE = { width: 384, height: 184 }

const KITCHEN: HostTarget = {
  id: 'display.kitchen',
  label: 'Kitchen tag',
  capabilities: { pixel_width: 296, pixel_height: 128, color_scheme: 0x01 },
}
const HALLWAY: HostTarget = {
  id: 'display.hallway',
  label: 'Hallway 7.5"',
  capabilities: { pixel_width: 296, pixel_height: 128, color_scheme: 0x01 },
}

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

function mountedEditorView(): EditorView {
  const editorRoot = shadow().querySelector('.cm-editor')
  if (!editorRoot) {
    throw new Error('CodeMirror .cm-editor root not found — did the designer mount?')
  }
  const view = EditorView.findFromDOM(editorRoot as HTMLElement)
  if (!view) {
    throw new Error('EditorView.findFromDOM returned null')
  }
  return view
}

/**
 * Break the live document the way a user does — a real annotated keystroke
 * (`shouldReportYamlDocChange` ignores unannotated transactions by design,
 * ADR-009). Deleting the `type` key's colon makes the doc unparseable.
 */
function breakYamlDocument(): { from: number; to: number } {
  const view = mountedEditorView()
  const colon = view.state.doc.toString().indexOf(':')
  act(() => {
    view.dispatch({
      changes: { from: colon, to: colon + 1, insert: '' },
      annotations: Transaction.userEvent.of('input.type'),
    })
  })
  return { from: colon, to: colon }
}

function repairYamlDocument(at: { from: number; to: number }): void {
  const view = mountedEditorView()
  act(() => {
    view.dispatch({
      changes: { from: at.from, to: at.to, insert: ':' },
      annotations: Transaction.userEvent.of('input.type'),
    })
  })
}

/** The orientation buttons in the display config — editable in preview mode. */
function clickRotation(degrees: number): void {
  fireEvent.click(designer().getByRole('button', { name: `${degrees}°` }))
}

function contextOf(call: unknown): HostPreviewContext {
  return (call as [string, HostPreviewContext])[1]
}

function payloadOf(call: unknown): string {
  return (call as [string, HostPreviewContext])[0]
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

const emptyClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  stubCanvasViewportBox()
  // Real CodeMirror edits (the blocked-document cases) walk ranges jsdom does
  // not implement.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect
  }
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

  it('refuses to preview a broken document, and previews it once repaired', async () => {
    const renderPreview = vi.fn(async () => pngBlob('host-render'))
    mountRaw({ payload: PAYLOAD, renderPreview })

    const broken = breakYamlDocument()

    // Entering a preview needs a payload worth rendering (maintainer ruling):
    // the toggle is disabled and says why, instead of the designer sending the
    // last-valid payload and showing a render of something else.
    await waitFor(() => expect(previewToggle()).toBeDisabled())
    expect(shadow().textContent).toContain('Fix the YAML errors to preview')
    fireEvent.click(previewToggle())
    expect(renderPreview).not.toHaveBeenCalled()
    expect(previewImage()).toBeNull()

    repairYamlDocument(broken)

    await waitFor(() => expect(previewToggle()).toBeEnabled())
    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewImage()).not.toBeNull())
  })

  it('cannot be broken from inside: an invalid host push throws and leaves the preview standing', async () => {
    const image = pngBlob('host-render')
    const handle = mountRaw({ payload: PAYLOAD, renderPreview: async () => image })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewBlob()).toBe(image))

    // The editor is read-only in preview mode and a host push parses or throws,
    // so `yamlBlocked` cannot turn true while a host render is on screen — which
    // is why no YAML-error overlay can ever paint over it.
    expect(() => act(() => handle.setPayload(BROKEN_PAYLOAD))).toThrow()

    expect(previewToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(previewBlob()).toBe(image)
    expect(shadow().querySelector('[data-testid="canvas-blocked-overlay"]')).toBeNull()
    expect(shadow().textContent).not.toContain('YAML has errors')
  })

  it('carries the canvas geometry and re-requests when the surface is re-oriented', async () => {
    const renderPreview = vi.fn(async () => pngBlob('host-render'))
    mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))
    expect(contextOf(renderPreview.mock.calls[0]).display).toEqual({
      width: DEFAULT_SURFACE.width,
      height: DEFAULT_SURFACE.height,
      rotation: 0,
    })
    expect(previewImage()).toHaveAttribute('width', String(DEFAULT_SURFACE.width))

    // A quarter turn re-orients the logical surface (issue #139): the host is
    // asked for a render of the surface the payload is now authored against.
    clickRotation(90)

    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2))
    expect(contextOf(renderPreview.mock.calls[1]).display).toEqual({
      width: DEFAULT_SURFACE.height,
      height: DEFAULT_SURFACE.width,
      rotation: 90,
    })
    // The image box follows the canvas it is rendered for.
    await waitFor(() =>
      expect(previewImage()).toHaveAttribute('width', String(DEFAULT_SURFACE.height)),
    )
    expect(previewImage()).toHaveAttribute('height', String(DEFAULT_SURFACE.width))
  })

  it('re-requests the render when the host pushes a new payload', async () => {
    const renderPreview = vi.fn(async () => pngBlob('host-render'))
    const handle = mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))

    act(() => handle.setPayload(PUSHED_PAYLOAD))

    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2))
    expect(payloadOf(renderPreview.mock.calls[1])).toContain('Pushed')
    expect(payloadOf(renderPreview.mock.calls[1])).toBe(handle.getPayload())
  })

  it('re-requests the render when the user picks another display', async () => {
    const renderPreview = vi.fn(async () => pngBlob('host-render'))
    mountRaw({
      payload: PAYLOAD,
      targets: [KITCHEN, HALLWAY],
      onTargetSelected: () => {},
      renderPreview,
    })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))
    expect(contextOf(renderPreview.mock.calls[0]).targetId).toBeUndefined()

    const picker = designer().getByLabelText('Display') as HTMLSelectElement
    const option = Array.from(picker.options).find((entry) => entry.textContent === HALLWAY.label)
    fireEvent.change(picker, { target: { value: option?.value } })

    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(2))
    expect(contextOf(renderPreview.mock.calls[1]).targetId).toBe(HALLWAY.id)
  })

  it('points the image at a URL string the provider answers with', async () => {
    const url = 'data:image/png;base64,iVBORw0KGgo='
    mountRaw({ payload: PAYLOAD, renderPreview: async () => url })

    fireEvent.click(previewToggle())

    await waitFor(() => expect(previewImage()).not.toBeNull())
    expect(previewImage()).toHaveAttribute('src', url)
    // A URL is the host's own; the designer never mints or revokes one for it.
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('states that an answer which is not an image is not a preview', async () => {
    mountRaw({
      payload: PAYLOAD,
      renderPreview: async () => ({ nothing: 'useful' }) as unknown as Blob,
    })

    fireEvent.click(previewToggle())

    const error = await waitFor(() => designer().getByTestId('display-preview-error'))
    expect(error).toHaveTextContent('The host returned no preview image')
    expect(previewImage()).toBeNull()
  })

  it('mints no object URL for a render that answers after destroy()', async () => {
    const answer = deferred<Blob>()
    const renderPreview = vi.fn(() => answer.promise)
    const handle = mountRaw({ payload: PAYLOAD, renderPreview })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))

    act(() => handle.destroy())
    await act(async () => {
      answer.resolve(pngBlob('too-late'))
    })

    // Nothing is on screen to paint it on, so nothing may be allocated for it —
    // an object URL minted here leaks for the lifetime of the host page.
    const minted = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.results.map(
      (result) => result.value as string,
    )
    const revoked = (URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0] as string,
    )
    expect(minted.filter((url) => !revoked.includes(url))).toEqual([])
  })

  it('names the downloaded PNG a display preview while the host render shows', async () => {
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })
    mountRaw({ payload: PAYLOAD, renderPreview: async () => pngBlob('host-render') })

    fireEvent.click(previewToggle())
    await waitFor(() => expect(previewImage()).not.toBeNull())
    fireEvent.click(designer().getByRole('button', { name: 'Download PNG' }))

    // Side-by-side diffing against the designer's own export is the point of
    // this seam, so the two files must not collide in the download folder.
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0]).toMatch(/^display-preview-.*\.png$/)
  })

  it('throws out of mount() when renderPreview is not a function', () => {
    expect(() =>
      mount(container, { payload: PAYLOAD, renderPreview: 'not a function' as never }),
    ).toThrow(/renderPreview/)
    expect(container.shadowRoot).toBeNull()
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
