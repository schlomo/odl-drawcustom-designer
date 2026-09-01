/** @vitest-environment jsdom */
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
import { listContentMapKeys, resetContentMap, resolveAsset } from '../../src/core'
import { resetHostAssetResolvers } from '../../src/core'

/**
 * `hostOwnsAssets` mount option: declares that the host resolves its own
 * assets (`resolveAsset`, ADR-002 tier 3), so the designer's local
 * IndexedDB content map is redundant and misleading — an upload there lives
 * in one browser and never reaches the host, so a design that depends on it
 * renders fine here and then fails the moment it is sent (maintainer
 * real-hardware finding). This is the mount boundary the HA integration
 * actually calls: `mount(el, { hostOwnsAssets: true, resolveAsset })`.
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

let container: HTMLElement
const handles: MountHandle[] = []

function mountWith(options: Parameters<typeof mount>[1] = {}): MountHandle {
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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  stubMatchMedia()
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  handles.length = 0
  resetContentMap()
})

afterEach(() => {
  for (const handle of handles.splice(0)) {
    try {
      act(() => handle.destroy())
    } catch {
      // already destroyed by the test
    }
  }
  resetHostAssetResolvers()
  resetContentMap()
  vi.unstubAllGlobals()
})

const PAYLOAD = [
  '- type: dlimg',
  '  url: host-logo.png',
  '  x: 0',
  '  y: 0',
  '  xsize: 10',
  '  ysize: 10',
  '',
].join('\n')

describe('mount({ hostOwnsAssets }) — read-only Content tab (host-owned assets)', () => {
  it('a mount with no hostOwnsAssets option offers Upload in the Content tab, as today', async () => {
    mountWith({ payload: PAYLOAD })
    await act(async () => {})

    fireEvent.click(designer().getByRole('button', { name: 'Content' }))

    expect(designer().queryAllByRole('button', { name: 'Upload' }).length).toBeGreaterThan(0)
  })

  it('hostOwnsAssets: true removes Upload/Clear from the Content tab — nothing reachable writes the store', async () => {
    const hostResolveAsset = vi.fn(async () => new Blob(['bytes'], { type: 'image/png' }))
    mountWith({ payload: PAYLOAD, hostOwnsAssets: true, resolveAsset: hostResolveAsset })
    await act(async () => {})

    fireEvent.click(designer().getByRole('button', { name: 'Content' }))

    // `queryAllByRole` rather than `queryByRole`: this reachability check
    // must hold across every surface that could offer an upload button (the
    // Content tab AND the property panel's image-URL field for the same
    // selected element), not just the first one found.
    expect(designer().queryAllByRole('button', { name: 'Upload' })).toHaveLength(0)
    expect(designer().queryAllByRole('button', { name: 'Replace' })).toHaveLength(0)
    expect(designer().queryAllByRole('button', { name: 'Clear' })).toHaveLength(0)
    expect(container.shadowRoot?.querySelector('input[type="file"]')).toBeNull()

    // The row is still listed, read-only — an explorer, not an empty tab.
    // `getAllByText` rather than `getByText`: the same asset name can also
    // legitimately appear in the (still-editable) image-URL property field
    // for the selected element — that is a different, non-upload surface.
    expect(designer().getAllByText('host-logo.png').length).toBeGreaterThan(0)

    await act(async () => {})
    // No reachable control ever called into the local store.
    expect(listContentMapKeys()).toEqual([])
  })

  it('the Content tab still explores payload-referenced content under hostOwnsAssets: a host-only asset lists with its Host badge, nothing reachable writes it', async () => {
    // Maintainer field verification (real Home Assistant panel, 2026-09-01):
    // a payload referencing `/media/...` he never uploaded to that browser
    // showed up in the Content tab labelled HOST. The tab is an explorer of
    // what the payload references and how each name resolves — uploads
    // removed must not turn that into an empty tab.
    const hostResolveAsset = vi.fn(async () => new Blob(['bytes'], { type: 'image/png' }))
    mountWith({ payload: PAYLOAD, hostOwnsAssets: true, resolveAsset: hostResolveAsset })

    // Let the canvas's own render pass ask the host resolver and settle —
    // the Content tab's status badge reads the same settled cache
    // (`hasHostSuppliedAsset`) the canvas render does.
    await act(async () => {})
    await act(async () => {})

    fireEvent.click(designer().getByRole('button', { name: 'Content' }))

    expect(designer().getByText('Host')).toBeInTheDocument()
    expect(designer().queryAllByRole('button', { name: 'Upload' })).toHaveLength(0)
    expect(designer().queryAllByRole('button', { name: 'Clear' })).toHaveLength(0)
    expect(container.shadowRoot?.querySelector('input[type="file"]')).toBeNull()
    expect(listContentMapKeys()).toEqual([])
  })

  it('hostOwnsAssets: { hint } renders the host\'s own sentence where Upload was', async () => {
    const HINT = 'Add files to the media folder in your Home Assistant config.'
    mountWith({ payload: PAYLOAD, hostOwnsAssets: { hint: HINT } })
    await act(async () => {})

    fireEvent.click(designer().getByRole('button', { name: 'Content' }))

    expect(designer().getByText(HINT)).toBeInTheDocument()
    expect(designer().queryAllByRole('button', { name: 'Upload' })).toHaveLength(0)
  })

  it('a design referencing an asset only the host can resolve still renders through the resolver tier under hostOwnsAssets', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' })
    const hostResolveAsset = vi.fn(async () => blob)
    mountWith({ payload: PAYLOAD, hostOwnsAssets: true, resolveAsset: hostResolveAsset })

    await act(async () => {})

    expect(hostResolveAsset).toHaveBeenCalledWith('image', 'host-logo.png')
    // The local content map never gained the host's asset — it stays a
    // separate, later tier (ADR-002); resolveAsset(key) reports it as
    // 'missing' locally (host resolution is a distinct tier from this map).
    expect(resolveAsset('host-logo.png').status).toBe('missing')
  })
})
