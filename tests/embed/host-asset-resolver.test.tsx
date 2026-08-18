/** @vitest-environment jsdom */
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { AssetKind, MountHandle } from '../../src/embed'
import {
  hasHostAssetResolver,
  resetHostAssetResolvers,
  resolveHostAsset,
} from '../../src/core'

/**
 * `resolveAsset` mount option (issue #138 layer 1): the host resolves payload
 * asset names the designer cannot resolve locally. A stable closure fixed at
 * mount (ADR-018: data is pushed, functions are not), live from before the
 * first painted frame until `destroy()`.
 */

// The kind discriminator is part of the published surface: a host writing an
// adapter in TypeScript has to be able to name it (issue #138 layer 1).
const PUBLISHED_KINDS: AssetKind[] = ['font', 'image']

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
    resetHostAssetResolvers()
    vi.unstubAllGlobals()
  }
})

describe('mount({ resolveAsset }) — host asset seam (issue #138)', () => {
  it('publishes the asset kinds a host adapter has to switch on', () => {
    expect(PUBLISHED_KINDS).toEqual(['font', 'image'])
  })

  it('routes unresolvable asset names to the host closure, kind and name intact', async () => {
    const blob = new Blob(['bytes'], { type: 'font/ttf' })
    const resolveAsset = vi.fn(async () => blob)
    mountWith({ resolveAsset })

    await expect(resolveHostAsset('font', 'Ubuntu-R.ttf')).resolves.toEqual({
      status: 'blob',
      blob,
    })
    expect(resolveAsset).toHaveBeenCalledWith('font', 'Ubuntu-R.ttf')
  })

  it('is live before the first painted frame and gone after destroy()', async () => {
    const handle = mountWith({ resolveAsset: async () => '/media/logo.png' })
    expect(hasHostAssetResolver()).toBe(true)

    act(() => handle.destroy())

    expect(hasHostAssetResolver()).toBe(false)
    await expect(resolveHostAsset('image', 'logo.png')).resolves.toEqual({ status: 'absent' })
  })

  it('has the host tier installed before the designer creates any DOM', () => {
    // Call-order probe (the issue #115 pattern): the first thing the lifecycle
    // does to the container is attach its shadow root, so recording the tier's
    // state there pins the install position — an install moved after DOM setup
    // leaves a window in which the first frame resolves assets locally only.
    const seen: boolean[] = []
    const realAttachShadow = container.attachShadow.bind(container)
    container.attachShadow = ((init: ShadowRootInit) => {
      seen.push(hasHostAssetResolver())
      return realAttachShadow(init)
    }) as HTMLElement['attachShadow']

    mountWith({ resolveAsset: async () => null })

    expect(seen).toEqual([true])
  })

  it("resolves the initial payload's own host assets through the host, not as a later repaint", async () => {
    // `mount({ payload })` renders in the same tick, so the very first frame
    // already references this font: the host must be consulted for it without
    // the caller pushing anything.
    const resolveAsset = vi.fn(async () => null)
    mountWith({
      payload: '- type: text\n  value: Hi\n  x: 1\n  y: 1\n  font: host-initial.ttf\n',
      resolveAsset,
    })

    await act(async () => {})

    expect(resolveAsset).toHaveBeenCalledWith('font', 'host-initial.ttf')
  })

  it('leaves asset resolution local-only for a mount that passes none', () => {
    mountWith({})

    expect(hasHostAssetResolver()).toBe(false)
  })

  it('uninstalls the resolver when the mount fails, so a retry does not stack tiers', () => {
    // A container that already carries a CLOSED shadow root cannot be mounted
    // into: `container.shadowRoot` reads null, so the lifecycle tries to attach
    // one and the DOM rejects it. The container must come back untouched
    // (issue #116) — and that pristine guarantee covers the asset tier too,
    // which is installed before any of this runs.
    container.attachShadow({ mode: 'closed' })
    const resolveAsset = vi.fn(async () => null)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => mount(container, { resolveAsset })).toThrow()
      expect(hasHostAssetResolver()).toBe(false)
    }

    expect(resolveAsset).not.toHaveBeenCalled()
  })
})
