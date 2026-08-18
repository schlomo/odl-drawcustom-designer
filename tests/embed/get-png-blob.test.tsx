/** @vitest-environment jsdom */
import { act } from 'react'
import { waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import { mountDesigner } from '../../src/embed/mount'
import type { DesignerHost } from '../../src/embed/host'
import type { MountHandle } from '../../src/embed'
import type { AppBootstrap } from '../../src/ui/bootstrap/appBootstrap'

// Full-designer mounts exceed vitest's 5s default on 2-core CI runners (the
// documented gotcha — see tests/embed/host-preview.test.tsx).
vi.setConfig({ testTimeout: 30_000 })

/**
 * `MountHandle.getPngBlob()` (issue #109 review, maintainer-ruled fix on
 * PR #143): the designer's own PNG export, read directly, the same "read
 * access instead of driving the UI" shape `getPayload()` established
 * (issue #104). Exists so a host with no rendering backend of its own can
 * answer `renderPreview` without writing a second renderer — the demo page
 * is the reference consumer (demo/host.js).
 *
 * jsdom has no real `<canvas>` 2D context (no optional `canvas` npm package
 * installed), so this stubs just enough of it — `getContext('2d')`,
 * `getImageData`/`putImageData`, `toBlob` — for `renderPayloadToPngBlob` to
 * run its real code path end to end and hand back a real `Blob`.
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

/** Just enough Canvas 2D surface for renderPayloadToPngBlob's real code path. */
function stubCanvasRendering() {
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
      colorSpace: 'srgb' as const,
    })),
    putImageData: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    callback(new Blob(['stub-png-bytes'], { type: type ?? 'image/png' }))
  })
  return context
}

// No elements (the default with no `payload` option): the stubbed 2D context
// below covers only the background fill + finalize path every export takes.
// Real element rendering — opentype glyph shaping, SVG-layer primitives
// rasterized through an `Image` load jsdom cannot decode — is a real feature
// exercised for real in the Playwright e2e suite against a real browser
// canvas; this test is wiring-only (the plumbing from `getPngBlob()` down to
// the registered source and back, and its independence from preview mode).
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

function designer() {
  return within(container.shadowRoot as unknown as HTMLElement)
}

function bootstrapWith(value: string): AppBootstrap {
  return {
    sessionName: value,
    elements: [{ type: 'text', value, x: 0, y: 0 }],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

function stubHost(overrides: Partial<DesignerHost>): DesignerHost {
  return {
    styleScope: 'shadow',
    theme: { owner: 'host', value: 'light' },
    fill: 'container',
    shareLink: false,
    persistence: null,
    loadBootstrap: () => bootstrapWith('Stub'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
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
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

describe('MountHandle.getPngBlob() (issue #109 review)', () => {
  it('resolves with the designer’s own PNG export', async () => {
    stubCanvasRendering()
    const handle = mountRaw()

    await waitFor(() => expect(designer().getByRole('button', { name: 'Add text' })).toBeInTheDocument())

    const blob = await handle.getPngBlob()

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
  })

  it('answers the same way whether or not Display preview is showing a host image', async () => {
    stubCanvasRendering()
    const hostImage = new Blob(['host-render'], { type: 'image/png' })
    const renderPreview = vi.fn(async () => hostImage)
    const handle = mountRaw({ renderPreview })

    await waitFor(() => expect(designer().getByRole('button', { name: 'Add text' })).toBeInTheDocument())

    const beforePreview = await handle.getPngBlob()
    expect(beforePreview.type).toBe('image/png')

    act(() => {
      designer().getByRole('button', { name: 'Display preview' }).click()
    })
    await waitFor(() => expect(renderPreview).toHaveBeenCalledTimes(1))

    // Still the designer's own client-side render, never the host's bytes —
    // a renderPreview built on getPngBlob() must not be able to call itself.
    const duringPreview = await handle.getPngBlob()
    expect(duringPreview.type).toBe('image/png')
    expect(duringPreview).not.toBe(hostImage)
  })

  it('rejects rather than hanging while no render source has registered yet', async () => {
    let resolveBootstrap!: (bootstrap: AppBootstrap) => void
    const handle = mountDesigner(
      container,
      stubHost({
        loadBootstrap: () =>
          new Promise<AppBootstrap>((resolve) => {
            resolveBootstrap = resolve
          }),
      }),
    )
    handles.push(handle)

    await expect(handle.getPngBlob()).rejects.toThrow(/before the designer finished mounting/)

    // Cleans up: let the pending bootstrap resolve so destroy() in afterEach
    // does not leave a dangling async render mid-flight.
    stubCanvasRendering()
    await act(async () => {
      resolveBootstrap(bootstrapWith('Stub'))
      await Promise.resolve()
    })
  })

  it('throws MountHandle used after destroy() like every other method', async () => {
    stubCanvasRendering()
    const handle = mountRaw()
    await waitFor(() => expect(designer().getByRole('button', { name: 'Add text' })).toBeInTheDocument())

    act(() => handle.destroy())

    expect(() => handle.getPngBlob()).toThrow('MountHandle used after destroy()')
  })
})
