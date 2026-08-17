/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HOST_ASSET_RETRY_DELAY_MS,
  HOST_ASSET_TIMEOUT_MS,
  clearFontRegistry,
  clearImageAvailabilityRegistry,
  getFont,
  installHostAssetResolver,
  resetContentMap,
  resetHostAssetResolvers,
  resolveHostAsset,
  safeRenderElement,
  setAsset,
  type AssetKind,
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

function fontBytes(): Buffer {
  return readFileSync(bundledFontPath('ppb.ttf'))
}

function fontBlob(): Blob {
  return new Blob([fontBytes()], { type: 'font/ttf' })
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

/**
 * `document.fonts` + `FontFace` double that behaves like the browser in the one
 * way this tier can get wrong: a real `FontFace` constructor throws
 * `SyntaxError` when its source string is not a parseable CSS `src` descriptor,
 * so an unescaped `url(…)` built from a host-supplied URL containing `)` is a
 * hard failure, not a cosmetic one. Tracks every add and delete so
 * mount/destroy symmetry is observable.
 */
function withFontFaceTracking(
  run: (tracked: { added: unknown[]; deleted: unknown[] }) => Promise<void> | void,
): Promise<void> {
  const CSS_URL = /^url\((?:"[^"]*"|'[^']*'|[^"'()\s]*)\)$/

  class FontFaceStub {
    constructor(
      readonly family: string,
      readonly source: unknown,
    ) {
      if (typeof source === 'string' && !CSS_URL.test(source)) {
        throw new SyntaxError(`FontFace: could not parse src "${source}"`)
      }
    }
    async load(): Promise<this> {
      return this
    }
  }

  const added: unknown[] = []
  const deleted: unknown[] = []
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  vi.stubGlobal('FontFace', FontFaceStub)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: (face: unknown) => added.push(face),
      delete: (face: unknown) => deleted.push(face),
    },
  })

  return Promise.resolve(run({ added, deleted })).finally(() => {
    vi.unstubAllGlobals()
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts)
    } else {
      // @ts-expect-error test cleanup of a property jsdom does not define
      delete document.fonts
    }
  })
}

/**
 * How many microtask turns a loader batch needs to settle. Used to pin the
 * standalone parity invariant as *behavior* rather than a helper's return
 * value: with no resolver installed the loader must not await the host tier at
 * all, so an unresolvable key has to settle in exactly as many turns as a key
 * whose branch can never reach that tier.
 */
async function microtaskTurnsToSettle(run: () => Promise<unknown>): Promise<number> {
  let turns = 0
  let settled = false
  void run().then(() => {
    settled = true
  })
  while (!settled && turns < 100) {
    turns += 1
    await Promise.resolve()
  }
  return turns
}

function textElement(font: string): DrawElement {
  return { type: 'text', value: 'Hello', x: 10, y: 10, font }
}

function isRenderErrorFor(font: string): boolean {
  const result = safeRenderElement(textElement(font), ctx)
  return result?.layer === 'svg' && result.primitive.kind === 'render-error'
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
  afterEach(() => {
    resetAll()
    vi.useRealTimers()
  })

  it('renders host-supplied font text exactly as a locally uploaded copy of the same font', async () => {
    const localKey = 'local-copy.ttf'
    const hostKey = 'host-copy.ttf'
    setAsset(localKey, { blob: fontBlob(), mime: 'font/ttf' })
    installHostAssetResolver(async () => fontBlob())

    const { outcomes } = await loadOpentypeFontMapWithOutcomes([localKey, hostKey])
    expect(outcomes.get(hostKey)).toMatchObject({ status: 'ready' })
    expect(getFont(hostKey)).toBeDefined()

    const hostRender = safeRenderElement(textElement(hostKey), ctx)
    const localRender = safeRenderElement(textElement(localKey), ctx)

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

  it('shows the render-error state for a host that takes the call and never answers', async () => {
    // No AbortSignal in this layer (issue #138 ruling): the timeout is the
    // whole mechanism, and what it has to produce is the SAME visible failure
    // a decline produces — never an element stuck mid-load with no error.
    vi.useFakeTimers({ now: 0 })
    let hang = true
    installHostAssetResolver(async () =>
      hang ? await new Promise<never>(() => {}) : fontBlob(),
    )
    const key = 'hung-host-font.ttf'

    const pending = loadOpentypeFontMapWithOutcomes([key])
    await vi.advanceTimersByTimeAsync(HOST_ASSET_TIMEOUT_MS)
    const { outcomes } = await pending

    expect(outcomes.get(key)).toMatchObject({ status: 'failed' })
    expect(outcomes.get(key)?.message).toContain('did not respond')
    expect(isRenderErrorFor(key)).toBe(true)

    // The ordinary retry window applies from the timeout's settle, so a host
    // that comes back heals on the next asset-affecting load pass.
    hang = false
    vi.setSystemTime(HOST_ASSET_TIMEOUT_MS + HOST_ASSET_RETRY_DELAY_MS + 1)
    await loadOpentypeFontMapWithOutcomes([key])
    expect(isRenderErrorFor(key)).toBe(false)
  })

  it('heals a declined font on the next load pass after the retry window, clearing the error', async () => {
    // There is no background timer and nothing wakes the designer: the retry
    // happens on the next asset-affecting load pass that runs after the window
    // has elapsed. This is what docs/embedding.md must say, so pin it.
    vi.useFakeTimers({ now: 0 })
    let supply = false
    const resolver = vi.fn(async () => (supply ? fontBlob() : null))
    installHostAssetResolver(resolver)
    const key = 'late-host-font.ttf'

    await loadOpentypeFontMapWithOutcomes([key])
    expect(isRenderErrorFor(key)).toBe(true)

    // Host now has the file, but nothing asks it again inside the window…
    supply = true
    await loadOpentypeFontMapWithOutcomes([key])
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(isRenderErrorFor(key)).toBe(true)

    // …and time alone does not heal it either: a load pass has to run.
    vi.setSystemTime(HOST_ASSET_RETRY_DELAY_MS + 1)
    expect(isRenderErrorFor(key)).toBe(true)

    await loadOpentypeFontMapWithOutcomes([key])
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(isRenderErrorFor(key)).toBe(false)
    expect(getFont(key)).toBeDefined()
  })

  it('keeps the local-only message when no resolver is installed', async () => {
    const { outcomes } = await loadOpentypeFontMapWithOutcomes(['standalone-missing.ttf'])

    expect(outcomes.get('standalone-missing.ttf')?.message).toBe(
      'standalone-missing.ttf is not uploaded — add it in Content Manager or use ppb.ttf / rbm.ttf.',
    )
  })

  it('awaits nothing extra with no resolver installed — standalone takes the pre-tier path', async () => {
    // `unknown.xyz` is rejected for its extension before any tier is consulted,
    // so its branch can never reach the host tier: it is the pre-tier control.
    // `unknown.ttf` walks the whole tier chain and finds nothing. With no
    // resolver installed the two must settle in the SAME number of microtask
    // turns — forcing the host tier on (or consulting it first) adds awaits to
    // one side only and breaks this equality.
    const control = await microtaskTurnsToSettle(() =>
      loadOpentypeFontMapWithOutcomes(['unknown.xyz']),
    )
    const throughEveryTier = await microtaskTurnsToSettle(() =>
      loadOpentypeFontMapWithOutcomes(['unknown.ttf']),
    )

    expect(throughEveryTier).toBe(control)
  })

  it('never asks the host for a font the local tiers already resolve', async () => {
    const asked: string[] = []
    installHostAssetResolver(async (kind: AssetKind, name: string) => {
      asked.push(`${kind}:${name}`)
      return fontBlob()
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(await fontBlob().arrayBuffer())),
    )
    setAsset('uploaded.ttf', { blob: fontBlob(), mime: 'font/ttf' })

    const { outcomes } = await loadOpentypeFontMapWithOutcomes(['uploaded.ttf', 'ppb.ttf'])

    expect(outcomes.get('uploaded.ttf')).toMatchObject({ status: 'ready' })
    expect(outcomes.get('ppb.ttf')).toMatchObject({ status: 'ready' })
    // An upload wins over the host's copy, and a bundled font costs no round
    // trip: the host resolver is the LAST tier, so it hears about neither.
    expect(asked).toEqual([])
    vi.unstubAllGlobals()
  })

  it('asks the host at most once per font, however often loading re-runs', async () => {
    const resolver = vi.fn(async () => fontBlob())
    installHostAssetResolver(resolver)

    await loadOpentypeFontMapWithOutcomes(['once.ttf'])
    clearOpentypeFontCacheForTests()
    await loadOpentypeFontMapWithOutcomes(['once.ttf'])

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('drops a host-supplied font from every cache when that mount is disposed', async () => {
    // The parsed-font cache, the core font registry and the CSS family map all
    // outlive a mount. Left populated, the next host on the page inherits the
    // previous host's bytes for the same name — a cross-host render window.
    await withFontFaceTracking(async () => {
      const dispose = installHostAssetResolver(async () => fontBlob())
      const key = 'host-only.ttf'

      await loadOpentypeFontMapWithOutcomes([key])
      expect(await loadFontFamilyMap([key])).toEqual(
        new Map([[key, 'drawcustom-font-host-only-ttf']]),
      )
      expect(getFont(key)).toBeDefined()
      expect(isRenderErrorFor(key)).toBe(false)

      dispose()

      expect(getFont(key)).toBeUndefined()
      // …and the fallback is the explicit error, not silently-wrong metrics.
      expect(isRenderErrorFor(key)).toBe(true)
      expect(await loadFontFamilyMap([key])).toEqual(new Map())
    })
  })

  it('registers a css font-face for a host-supplied font, so canvas text uses it', async () => {
    await withFontFaceTracking(async ({ added }) => {
      installHostAssetResolver(async () => fontBlob())

      const families = await loadFontFamilyMap(['host-face.ttf'])

      expect(families.get('host-face.ttf')).toBe('drawcustom-font-host-face-ttf')
      expect(added).toHaveLength(1)
    })
  })

  it('removes exactly the FontFaces it added for host fonts when the mount is disposed', async () => {
    await withFontFaceTracking(async ({ added, deleted }) => {
      const dispose = installHostAssetResolver(async () => fontBlob())

      await loadFontFamilyMap(['host-a.ttf', 'host-b.ttf'])
      expect(added).toHaveLength(2)
      expect(deleted).toEqual([])

      dispose()

      // Add count == delete count, and the same face objects: a mount must not
      // leave FontFaces behind on the host page's document.
      expect(deleted).toHaveLength(added.length)
      expect([...deleted].sort()).toEqual([...added].sort())
    })
  })

  it('loads a host font whose URL contains characters CSS url() cannot carry raw', async () => {
    // A host media route is free to hand back `…/logo (1).ttf` or a query
    // string with parentheses. Interpolating that into `url(…)` produces an
    // unparseable src descriptor and the font silently never loads.
    await withFontFaceTracking(async ({ added }) => {
      const url = '/host-media/fonts/weird)name(1).ttf?v=2'
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(await fontBlob().arrayBuffer())),
      )
      installHostAssetResolver(async () => url)

      const families = await loadFontFamilyMap(['weird.ttf'])

      expect(families.get('weird.ttf')).toBe('drawcustom-font-weird-ttf')
      expect(added).toHaveLength(1)
    })
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

  it('awaits nothing extra with no resolver installed — standalone takes the pre-tier path', async () => {
    // Same probe as the font side: the control key settles inside the content
    // map (wrong mime), never reaching the host tier, so an unresolvable key
    // must cost exactly the same number of microtask turns.
    setAsset('control.png', { blob: new Blob(['x'], { type: 'text/plain' }), mime: 'text/plain' })

    const control = await microtaskTurnsToSettle(() =>
      loadAssetImageMapWithOutcomes(['control.png']),
    )
    const throughEveryTier = await microtaskTurnsToSettle(() =>
      loadAssetImageMapWithOutcomes(['unknown.png']),
    )

    expect(throughEveryTier).toBe(control)
  })

  it('never asks the host for an image the local tiers already resolve', async () => {
    await withImmediateImageLoad(async () => {
      const asked: string[] = []
      installHostAssetResolver(async (kind: AssetKind, name: string) => {
        asked.push(`${kind}:${name}`)
        return pngBlob()
      })
      setAsset('uploaded.png', { blob: pngBlob(), mime: 'image/png' })

      const { outcomes } = await loadAssetImageMapWithOutcomes(['uploaded.png'])

      expect(outcomes.get('uploaded.png')).toMatchObject({ status: 'ready' })
      expect(asked).toEqual([])
    })
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

  it('never lets a font answer vouch for an image of the same name', async () => {
    // The two kinds share a namespace in the payload only by accident. A host
    // that has `logo.png` as a FONT (and declines the image) must not badge,
    // un-warn or keep the image row alive.
    await withImmediateImageLoad(async () => {
      const key = 'logo.png'
      installHostAssetResolver(async (kind) => (kind === 'font' ? fontBlob() : null))
      await resolveHostAsset('font', key)

      const elements: DrawElement[] = [
        { type: 'dlimg', url: key, x: 0, y: 0, xsize: 10, ysize: 10 },
      ]

      expect(buildContentAssetRows(elements, 'current')).toMatchObject([
        { key, status: 'missing' },
      ])
      expect(getMissingAssetMessages(elements)).toHaveLength(1)

      const { outcomes } = await loadAssetImageMapWithOutcomes([key])
      expect(outcomes.get(key)).toMatchObject({ status: 'missing' })

      // …and a stale decoded image for that key is pruned out, not retained on
      // the strength of the font answer.
      const stale = new Map([[key, {} as HTMLImageElement]])
      expect(pruneAssetImagesForKeys(stale, [key]).has(key)).toBe(false)
    })
  })
})
