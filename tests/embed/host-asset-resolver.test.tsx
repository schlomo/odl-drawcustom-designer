/** @vitest-environment jsdom */
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../../src/embed'
import type { MountHandle } from '../../src/embed'
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

  it('leaves asset resolution local-only for a mount that passes none', () => {
    mountWith({})

    expect(hasHostAssetResolver()).toBe(false)
  })
})
