/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearFontRegistry,
  clearImageAvailabilityRegistry,
  getFont,
  installHostAssetResolver,
  resetContentMap,
  resetHostAssetResolvers,
  safeRenderElement,
  setAsset,
  type DrawElement,
  type RenderContext,
} from '../../../src/core'
import { buildContentAssetRows } from '../../../src/ui/lib/content-asset-rows'
import { getMissingAssetMessages } from '../../../src/ui/lib/missing-asset-messages'
import {
  loadAssetImageMapWithOutcomes,
  pruneAssetImagesForKeys,
} from '../../../src/ui/lib/load-asset-images'
import {
  clearFontFamilyCacheForTests,
  loadFontFamilyMap,
} from '../../../src/ui/lib/load-font-faces'
import {
  clearOpentypeFontCacheForTests,
  loadOpentypeFontMapWithOutcomes,
} from '../../../src/ui/lib/load-opentype-fonts'
import { bundledFontPath } from '../../core/renderer/font-test-utils'

/**
 * Issue #138 layer 1: payloads reference fonts and images by bare name, which
 * an embedding host resolves from its own directories. The resolver is the
 * LAST tier — behind the local content map and the bundled assets (ADR-002) —
 * and everything it cannot supply must land in the designer's existing
 * explicit render-error state, naming the asset and the host (issue #10's
 * clear-error-over-wrong-render ruling).
 */

const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }

/** 1×1 red PNG — same fixture the local-tier image tests use. */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function pngBlob(): Blob {
  const binary = atob(PNG_1X1_BASE64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
}

function fontBlob(): Blob {
  const buffer = readFileSync(bundledFontPath('ppb.ttf'))
  return new Blob([buffer], { type: 'font/ttf' })
}

function withImmediateImageLoad(run: () => Promise<void> | void): Promise<void> {
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

  return Promise.resolve(run()).finally(() => {
    globalThis.Image = OriginalImage
  })
}

function resetAll(): void {
  resetHostAssetResolvers()
  resetContentMap()
  clearFontRegistry()
  clearOpentypeFontCacheForTests()
  clearFontFamilyCacheForTests()
  clearImageAvailabilityRegistry()
}

describe('host-resolved fonts (issue #138)', () => {
  afterEach(resetAll)

  it('renders host-supplied font text exactly as a locally uploaded copy of the same font', async () => {
    const localKey = 'local-copy.ttf'
    const hostKey = 'host-copy.ttf'
    setAsset(localKey, { blob: fontBlob(), mime: 'font/ttf' })
    installHostAssetResolver(async () => fontBlob())

    const { outcomes } = await loadOpentypeFontMapWithOutcomes([localKey, hostKey])
    expect(outcomes.get(hostKey)).toMatchObject({ status: 'ready' })
    expect(getFont(hostKey)).toBeDefined()

    const text = (font: string): DrawElement => ({ type: 'text', value: 'Hello', x: 10, y: 10, font })
    const hostRender = safeRenderElement(text(hostKey), ctx)
    const localRender = safeRenderElement(text(localKey), ctx)

    if (hostRender?.layer === 'svg' && hostRender.primitive.kind === 'render-error') {
      throw new Error('a host-supplied font must render, not error')
    }
    if (!localRender) {
      throw new Error('the locally uploaded control font failed to render')
    }
    // Same glyph geometry, same ink bounds — only the key each side names
    // differs, which is the proof that the host tier feeds the render path
    // exactly as the content map does.
    expect(hostRender).toEqual({
      ...localRender,
      primitive: { ...localRender.primitive, font: hostKey },
    })
  })

  it('loads a host-supplied font from a URL answer too', async () => {
    const fetchMock = vi.fn(async () => new Response(await fontBlob().arrayBuffer()))
    vi.stubGlobal('fetch', fetchMock)
    installHostAssetResolver(async () => '/host-media/fonts/url-font.ttf')

    const { outcomes } = await loadOpentypeFontMapWithOutcomes(['url-font.ttf'])

    expect(outcomes.get('url-font.ttf')).toMatchObject({ status: 'ready' })
    expect(fetchMock).toHaveBeenCalledWith('/host-media/fonts/url-font.ttf')
    vi.unstubAllGlobals()
  })

  it('names the asset and the host when the host declines a font', async () => {
    installHostAssetResolver(async () => null)
    const key = 'no-such-host-font.ttf'

    const { outcomes } = await loadOpentypeFontMapWithOutcomes([key])
    expect(outcomes.get(key)).toMatchObject({
      status: 'missing',
      message: expect.stringContaining(key),
    })
    expect(outcomes.get(key)?.message).toContain('could not be supplied by the host')

    const result = safeRenderElement({ type: 'text', value: 'Hi', x: 1, y: 1, font: key }, ctx)
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the render-error marker, got ${JSON.stringify(result)}`)
    }
    expect(result.primitive.message).toContain(key)
  })

  it('reports a rejecting resolver as a failure, with the reason', async () => {
    installHostAssetResolver(async () => {
      throw new Error('media store offline')
    })
    const key = 'unreachable-host-font.ttf'

    const { outcomes } = await loadOpentypeFontMapWithOutcomes([key])
    expect(outcomes.get(key)).toMatchObject({ status: 'failed' })
    expect(outcomes.get(key)?.message).toContain('media store offline')
  })

  it('keeps the local-only message when no resolver is installed', async () => {
    const { outcomes } = await loadOpentypeFontMapWithOutcomes(['standalone-missing.ttf'])

    expect(outcomes.get('standalone-missing.ttf')?.message).toBe(
      'standalone-missing.ttf is not uploaded — add it in Content Manager or use ppb.ttf / rbm.ttf.',
    )
  })

  it('asks the host at most once per font, however often loading re-runs', async () => {
    const resolver = vi.fn(async () => fontBlob())
    installHostAssetResolver(resolver)

    await loadOpentypeFontMapWithOutcomes(['once.ttf'])
    clearOpentypeFontCacheForTests()
    await loadOpentypeFontMapWithOutcomes(['once.ttf'])

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('registers a css font-face for a host-supplied font, so canvas text uses it', async () => {
    class FontFaceStub {
      constructor(
        readonly family: string,
        readonly source: unknown,
      ) {}
      async load(): Promise<this> {
        return this
      }
    }
    vi.stubGlobal('FontFace', FontFaceStub)
    const added: unknown[] = []
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (face: unknown) => added.push(face) },
    })
    installHostAssetResolver(async () => fontBlob())

    const families = await loadFontFamilyMap(['host-face.ttf'])

    expect(families.get('host-face.ttf')).toBe('drawcustom-font-host-face-ttf')
    expect(added).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})

describe('host-resolved images (issue #138)', () => {
  afterEach(resetAll)

  it('renders a host-supplied dlimg instead of the missing marker', async () => {
    await withImmediateImageLoad(async () => {
      installHostAssetResolver(async () => pngBlob())
      const url = 'host-logo.png'

      const { images, outcomes } = await loadAssetImageMapWithOutcomes([url])
      expect(outcomes.get(url)).toMatchObject({ status: 'ready' })
      expect(images.has(url)).toBe(true)

      const element: DrawElement = { type: 'dlimg', url, x: 10, y: 20, xsize: 40, ysize: 30 }
      const result = safeRenderElement(element, ctx)
      if (result?.layer === 'svg' && result.primitive.kind === 'render-error') {
        throw new Error('a host-supplied image must render, not error')
      }
    })
  })

  it('keeps host-supplied images when pruning the render image map', async () => {
    await withImmediateImageLoad(async () => {
      installHostAssetResolver(async () => pngBlob())
      const url = 'host-kept.png'

      const { images } = await loadAssetImageMapWithOutcomes([url])
      expect(pruneAssetImagesForKeys(images, [url]).has(url)).toBe(true)
    })
  })

  it('names the asset and the host when the host declines an image', async () => {
    installHostAssetResolver(async () => null)
    const url = 'no-such-host-image.png'

    const { outcomes } = await loadAssetImageMapWithOutcomes([url])
    expect(outcomes.get(url)).toMatchObject({ status: 'missing' })
    expect(outcomes.get(url)?.message).toContain(url)
    expect(outcomes.get(url)?.message).toContain('could not be supplied by the host')

    const result = safeRenderElement(
      { type: 'dlimg', url, x: 10, y: 20, xsize: 40, ysize: 30 },
      ctx,
    )
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(`expected the render-error marker, got ${JSON.stringify(result)}`)
    }
    expect(result.primitive).toMatchObject({ x: 10, y: 20, width: 40, height: 30 })
  })

  it('keeps the local-only message when no resolver is installed', async () => {
    const { outcomes } = await loadAssetImageMapWithOutcomes(['/local/standalone-missing.png'])

    expect(outcomes.get('/local/standalone-missing.png')?.message).toBe(
      '/local/standalone-missing.png is not uploaded — add it in Content Manager.',
    )
  })

  it('asks the host at most once per image, however often loading re-runs', async () => {
    await withImmediateImageLoad(async () => {
      const resolver = vi.fn(async () => pngBlob())
      installHostAssetResolver(resolver)

      await loadAssetImageMapWithOutcomes(['once.png'])
      await loadAssetImageMapWithOutcomes(['once.png'])

      expect(resolver).toHaveBeenCalledTimes(1)
    })
  })
})

describe('host-supplied assets are not reported as locally missing (issue #138)', () => {
  afterEach(resetAll)

  it('drops the missing-asset banner and badges the row as host-supplied', async () => {
    await withImmediateImageLoad(async () => {
      installHostAssetResolver(async () => pngBlob())
      const elements: DrawElement[] = [
        { type: 'dlimg', url: 'host-badged.png', x: 0, y: 0, xsize: 10, ysize: 10 },
      ]

      expect(getMissingAssetMessages(elements)).toHaveLength(1)

      await loadAssetImageMapWithOutcomes(['host-badged.png'])

      expect(getMissingAssetMessages(elements)).toEqual([])
      expect(buildContentAssetRows(elements, 'current')).toMatchObject([
        { key: 'host-badged.png', status: 'host' },
      ])
    })
  })
})
