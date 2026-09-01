/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listContentMapKeys, resetContentMap, resolveAsset } from '../../../src/core'
import { createEmbeddedHost } from '../../../src/embed/embeddedHost'
import { createStandaloneHost } from '../../../src/embed/standaloneHost'
import type { AppBootstrap } from '../../../src/ui/bootstrap/appBootstrap'
import { useProjectState } from '../../../src/ui/hooks/useProjectState'

/**
 * `hostOwnsAssets` mount option: a host that resolves its own assets
 * (`resolveAsset`, ADR-002 tier 3) declares that uploads/deletes into the
 * designer-local IndexedDB content map must never happen — an upload there
 * lives in one browser only and never reaches the host, so a design that
 * depends on it renders fine here and then fails the moment it is sent.
 *
 * This is the write boundary itself (`useProjectState.uploadAsset`/
 * `clearAsset`): even if some UI path still reached these functions, the
 * asset store must never be written. The UI-affordance removal is covered
 * separately in the ContentManager and property-panel tests.
 */

// jsdom implements neither real image decoding nor FontFace loading, so the
// real upload-verification path (`loadImageBlob`/`loadFontBlob`) would hang
// forever waiting for an `onload` that never fires — the same double
// `tests/ui/lib/host-resolved-assets.test.ts` uses for the same reason.
function stubAssetDecoders() {
  const OriginalImage = globalThis.Image

  class MockImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private _src = ''
    set src(value: string) {
      this._src = value
      this.onload?.()
    }
    get src(): string {
      return this._src
    }
  }
  // @ts-expect-error test double
  globalThis.Image = MockImage

  class MockFontFace {
    constructor(
      readonly family: string,
      readonly source: unknown,
    ) {}
    async load(): Promise<this> {
      return this
    }
  }
  vi.stubGlobal('FontFace', MockFontFace)

  if (!('createObjectURL' in URL)) {
    // @ts-expect-error test double
    URL.createObjectURL = () => 'blob:test'
  }
  if (!('revokeObjectURL' in URL)) {
    // @ts-expect-error test double
    URL.revokeObjectURL = () => {}
  }

  return () => {
    globalThis.Image = OriginalImage
  }
}

function bootstrap(): AppBootstrap {
  return {
    sessionName: 'Test',
    elements: [],
    canvas: { width: 200, height: 100, rotation: 0, colorMode: 'bwr', previewDitherMode: 0 },
    service: undefined,
    mockStates: {},
    mockAttributes: {},
    variables: {},
    importSource: 'default',
  }
}

let restoreImage: () => void

beforeEach(() => {
  resetContentMap()
  restoreImage = stubAssetDecoders()
})

afterEach(() => {
  restoreImage()
  vi.unstubAllGlobals()
  resetContentMap()
})

describe('useProjectState — hostOwnsAssets disables the local asset store (write boundary)', () => {
  it('a host with no hostOwnsAssets option uploads and stores the asset locally, as today', async () => {
    const host = createEmbeddedHost({})
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })
    const outcome = await result.current.uploadAsset('/local/logo.png', 'image', file)

    expect(outcome.ok).toBe(true)
    expect(listContentMapKeys()).toContain('/local/logo.png')
    expect(resolveAsset('/local/logo.png').status).toBe('resolved')
  })

  it('a standalone host uploads and stores the asset locally, as today', async () => {
    const host = createStandaloneHost()
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    const file = new File(['bytes'], 'ppb2.ttf', { type: 'font/ttf' })
    const outcome = await result.current.uploadAsset('ppb2.ttf', 'font', file)

    expect(outcome.ok).toBe(true)
    expect(listContentMapKeys()).toContain('ppb2.ttf')
  })

  it('hostOwnsAssets: true refuses uploadAsset and never writes the content map', async () => {
    const host = createEmbeddedHost({ hostOwnsAssets: true })
    const { result } = renderHook(() => useProjectState(bootstrap(), host))

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })
    const outcome = await result.current.uploadAsset('/local/logo.png', 'image', file)

    expect(outcome.ok).toBe(false)
    expect(listContentMapKeys()).toEqual([])
    expect(resolveAsset('/local/logo.png').status).toBe('missing')
  })

  it('hostOwnsAssets: true refuses clearAsset and leaves the content map untouched', async () => {
    // Upload while enabled, then re-render with a host that owns assets, to
    // prove clearAsset cannot delete what is already stored either.
    const enabledHost = createEmbeddedHost({})
    const { result, rerender } = renderHook(({ host }) => useProjectState(bootstrap(), host), {
      initialProps: { host: enabledHost },
    })
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })
    await result.current.uploadAsset('/local/logo.png', 'image', file)
    expect(listContentMapKeys()).toContain('/local/logo.png')

    const disabledHost = createEmbeddedHost({ hostOwnsAssets: true })
    rerender({ host: disabledHost })

    await result.current.clearAsset('/local/logo.png')

    expect(listContentMapKeys()).toContain('/local/logo.png')
    expect(resolveAsset('/local/logo.png').status).toBe('resolved')
  })
})
