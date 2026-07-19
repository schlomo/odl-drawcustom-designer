/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUNDLED_SHOWCASE_IMAGE_KEY,
  clearImageAvailabilityRegistry,
  imageUnavailableMessage,
  markImageUnavailable,
  resetContentMap,
  setAsset,
} from '../../../src/core'
import { SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY } from '../../../src/ui/preferences/keys'
import { suppressShowcaseBundled } from '../../../src/ui/preferences/showcaseAsset'
import { drawCanvasStub } from '../../../src/ui/lib/draw-canvas-stubs'
import {
  areAssetImageMapsEqual,
  collectDlimgAssetKeys,
  collectDlimgAssetKeysFromElements,
  loadAssetImageMap,
  loadAssetImageMapWithOutcomes,
  pruneAssetImagesForKeys,
} from '../../../src/ui/lib/load-asset-images'

/** 1×1 red PNG */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function pngBlob(): Blob {
  const binary = atob(PNG_1X1_BASE64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
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

describe('collectDlimgAssetKeys', () => {
  it('collects unique dlimg url keys', () => {
    expect(
      collectDlimgAssetKeys([
        { kind: 'dlimg-stub', url: '/local/a.png' },
        { kind: 'text-stub' },
        { kind: 'dlimg-stub', url: '/local/b.png' },
        { kind: 'dlimg-stub', url: '/local/a.png' },
      ]),
    ).toEqual(['/local/a.png', '/local/b.png'])
  })
})

describe('collectDlimgAssetKeysFromElements', () => {
  it('collects dlimg urls from draw elements', () => {
    expect(
      collectDlimgAssetKeysFromElements([
        {
          type: 'dlimg',
          url: '/local/logo.png',
          x: 0,
          y: 0,
          xsize: 10,
          ysize: 10,
        },
        {
          type: 'text',
          value: 'Hi',
          x: 0,
          y: 0,
        },
      ]),
    ).toEqual(['/local/logo.png'])
  })
})

describe('pruneAssetImagesForKeys', () => {
  afterEach(() => {
    resetContentMap()
  })

  it('drops cached images after the asset is cleared', () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    setAsset('/local/logo.png', { blob, mime: 'image/png' })
    const image = new Image()
    const cached = new Map([['/local/logo.png', image]])

    expect(pruneAssetImagesForKeys(cached, ['/local/logo.png']).has('/local/logo.png')).toBe(true)

    resetContentMap()

    expect(pruneAssetImagesForKeys(cached, ['/local/logo.png']).size).toBe(0)
  })
})

describe('areAssetImageMapsEqual', () => {
  it('compares map entries by reference', () => {
    const image = new Image()
    const left = new Map([['/local/a.png', image]])
    const right = new Map([['/local/a.png', image]])
    const different = new Map([['/local/a.png', new Image()]])

    expect(areAssetImageMapsEqual(left, right)).toBe(true)
    expect(areAssetImageMapsEqual(left, different)).toBe(false)
  })
})

describe('loadAssetImageMap', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  })

  afterEach(() => {
    resetContentMap()
  })

  it('loads uploaded image blobs from the content map', async () => {
    await withImmediateImageLoad(async () => {
      setAsset('/local/logo.png', { blob: pngBlob(), mime: 'image/png' })

      const images = await loadAssetImageMap(['/local/logo.png'])

      expect(images.size).toBe(1)
      expect(images.has('/local/logo.png')).toBe(true)
    })
  })

  it('skips missing and non-image assets', async () => {
    await withImmediateImageLoad(async () => {
      setAsset('ppb.ttf', { blob: new Blob(['font']), mime: 'font/ttf' })

      const images = await loadAssetImageMap(['/local/missing.png', 'ppb.ttf'])

      expect(images.size).toBe(0)
    })
  })

  it('loads the bundled showcase image when not suppressed', async () => {
    await withImmediateImageLoad(async () => {
      const images = await loadAssetImageMap([BUNDLED_SHOWCASE_IMAGE_KEY])
      expect(images.size).toBe(1)
      expect(images.has(BUNDLED_SHOWCASE_IMAGE_KEY)).toBe(true)
    })
  })

  it('skips the bundled showcase image after dismiss', async () => {
    suppressShowcaseBundled()

    await withImmediateImageLoad(async () => {
      const images = await loadAssetImageMap([BUNDLED_SHOWCASE_IMAGE_KEY])
      expect(images.size).toBe(0)
    })
  })
})

function withFailingImageLoad(run: () => Promise<void> | void): Promise<void> {
  const OriginalImage = globalThis.Image

  class FailingMockImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private _src = ''

    set src(value: string) {
      this._src = value
      this.onerror?.()
    }

    get src(): string {
      return this._src
    }
  }

  // @ts-expect-error test double
  globalThis.Image = FailingMockImage

  return Promise.resolve(run()).finally(() => {
    globalThis.Image = OriginalImage
  })
}

/**
 * Issue #55: `loadAssetImageMap` recorded only successes; there was no image
 * equivalent of `FontLoadOutcome`. `loadAssetImageMapWithOutcomes` settles
 * each key to 'ready' | 'missing' | 'failed', mirroring the font loader
 * exactly (including marking the core `image-availability` registry so
 * `renderDlimg` can throw into the render-error placeholder — see
 * tests/ui/lib/missing-image-render-error.test.ts for that half).
 */
describe('loadAssetImageMapWithOutcomes', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  })

  afterEach(() => {
    resetContentMap()
    clearImageAvailabilityRegistry()
  })

  it('reports missing for images that were never uploaded', async () => {
    const url = '/local/never-uploaded.png'
    const result = await loadAssetImageMapWithOutcomes([url])

    expect(result.outcomes.get(url)).toMatchObject({
      status: 'missing',
      message: expect.stringContaining('not uploaded'),
    })
    expect(result.images.has(url)).toBe(false)
  })

  it('reports failed when the blob fails to decode', async () => {
    await withFailingImageLoad(async () => {
      const url = '/local/corrupt.png'
      setAsset(url, { blob: pngBlob(), mime: 'image/png' })

      const result = await loadAssetImageMapWithOutcomes([url])

      expect(result.outcomes.get(url)).toMatchObject({ status: 'failed' })
      expect(result.images.has(url)).toBe(false)
    })
  })

  it('reports ready for a successfully decoded image', async () => {
    await withImmediateImageLoad(async () => {
      const url = '/local/logo-outcome.png'
      setAsset(url, { blob: pngBlob(), mime: 'image/png' })

      const result = await loadAssetImageMapWithOutcomes([url])

      expect(result.outcomes.get(url)).toMatchObject({ status: 'ready' })
      expect(result.images.has(url)).toBe(true)
    })
  })

  /**
   * Mirrors the font fix (PR #54, Copilot review 3610491466): the stale
   * "confirmed unavailable" mark from a previous failure must clear as soon
   * as the asset is known to resolve, BEFORE any await — not only once the
   * load fully settles. Otherwise a missing → upload → reload sequence would
   * keep the render-error marker up for the entire decode window of the
   * retry, violating the "no error while merely loading" contract.
   */
  it('clears a stale unavailable mark during the in-flight window once the asset resolves (missing -> upload -> reload)', () => {
    return withImmediateImageLoad(() => {
      const url = '/local/issue55-stale-mark-upload.png'
      markImageUnavailable(url, 'stale: previously missing')
      setAsset(url, { blob: pngBlob(), mime: 'image/png' })

      const pending = loadAssetImageMapWithOutcomes([url])
      expect(imageUnavailableMessage(url)).toBeUndefined()

      return pending
    })
  })

  it('keeps the mark for an image that is still missing at load start (no reverse flicker)', () => {
    const url = '/local/issue55-stale-mark-still-missing.png'
    markImageUnavailable(url, 'stale: previously missing')

    const pending = loadAssetImageMapWithOutcomes([url])
    expect(imageUnavailableMessage(url)).toBeTruthy()

    return pending
  })

  /**
   * Independent review finding on PR #58: `cancelled` in DesignerCanvas's
   * loading effect only gates the React `setState` calls — it never reached
   * the loader itself, so an OLD (superseded) batch's in-flight
   * `loadAssetImage` calls could still write `markImageUnavailable`/
   * `clearImageUnavailable` into the core registry after a NEWER batch had
   * already started (e.g. rapid element edits changing `dlimgAssetKeys`
   * mid-flight). If the old batch's write lands after the new batch's, it
   * can silently clobber a fresh, correct determination with a stale one.
   *
   * Fix: `loadAssetImageMapWithOutcomes` takes an optional `isStale()`
   * predicate, threaded down to every registry write. DesignerCanvas passes
   * its existing `cancelled` flag (already used to gate `setState`) as this
   * predicate — closing the gap for the module-level registry too, without
   * touching the registry unconditionally on every render (which would
   * un-error still-missing images and cause flicker).
   */
  it('an isStale() predicate returning true suppresses registry writes, without changing the returned outcome', async () => {
    const url = '/local/issue55-stale-batch-missing.png'

    const result = await loadAssetImageMapWithOutcomes([url], () => true)

    // The outcome itself is still computed and returned normally — only the
    // side effect on the shared core registry is suppressed.
    expect(result.outcomes.get(url)).toMatchObject({ status: 'missing' })
    expect(imageUnavailableMessage(url)).toBeUndefined()
  })

  it('a stale batch must not clobber a fresh mark already written by a newer batch for the same key', async () => {
    await withImmediateImageLoad(async () => {
      const url = '/local/issue55-stale-batch-clobber.png'

      // Simulate: a NEWER batch already determined (correctly) that this key
      // is available and cleared any prior mark — e.g. it just got uploaded.
      setAsset(url, { blob: pngBlob(), mime: 'image/png' })
      await loadAssetImageMapWithOutcomes([url])
      expect(imageUnavailableMessage(url)).toBeUndefined()

      // An OLDER, now-superseded batch's in-flight determination (e.g. it saw
      // the pre-upload "missing" state) finally resolves. Marked `isStale`,
      // its write must be suppressed so it cannot clobber the newer, correct
      // "available" state above.
      await loadAssetImageMapWithOutcomes([url], () => true)
      expect(imageUnavailableMessage(url)).toBeUndefined()
    })
  })

  it('a non-stale batch (the normal case) still marks/clears the registry exactly as before', async () => {
    const url = '/local/issue55-not-stale.png'

    const result = await loadAssetImageMapWithOutcomes([url], () => false)

    expect(result.outcomes.get(url)).toMatchObject({ status: 'missing' })
    expect(imageUnavailableMessage(url)).toBeTruthy()
  })
})

describe('drawCanvasStub dlimg preview', () => {
  it('draws a resolved asset image with resize_method', () => {
    const drawImage = vi.fn()
    const save = vi.fn()
    const restore = vi.fn()
    const beginPath = vi.fn()
    const rect = vi.fn()
    const clip = vi.fn()
    const fillRect = vi.fn()
    const ctx = {
      drawImage,
      save,
      restore,
      beginPath,
      rect,
      clip,
      fillRect,
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      getImageData: () => ({
        width: 64,
        height: 48,
        data: new Uint8ClampedArray(64 * 48 * 4),
      }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    const image = new Image()
    Object.defineProperty(image, 'naturalWidth', { value: 200 })
    Object.defineProperty(image, 'naturalHeight', { value: 100 })
    const assetImages = new Map([['/local/logo.png', image]])

    drawCanvasStub(
      ctx,
      {
        kind: 'dlimg-stub',
        x: 10,
        y: 20,
        width: 64,
        height: 48,
        url: '/local/logo.png',
        resizeMethod: 'contain',
      },
      assetImages,
    )

    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 200, 100, 10, 28, 64, 32)
    expect(fillRect).not.toHaveBeenCalled()
  })

  it('uses loaded font families for text stubs', () => {
    const ctx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    drawCanvasStub(
      ctx,
      {
        kind: 'text-stub',
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        anchorX: 0,
        anchorY: 0,
        value: 'Hi',
        drawLines: [{ text: 'Hi', visualText: 'Hi', x: 0, y: 16, width: 40, direction: 'ltr' }],
        color: '#000000',
        fontSize: 16,
        font: 'missing-preview.ttf',
      },
      new Map(),
      new Map([['missing-preview.ttf', 'drawcustom-font-missing-preview-ttf']]),
    )

    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.font).toBe('16px drawcustom-font-missing-preview-ttf, sans-serif')
  })
})
