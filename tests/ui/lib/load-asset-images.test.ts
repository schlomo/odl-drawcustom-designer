/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetContentMap, setAsset } from '../../../src/core/assets'
import { drawCanvasStub } from '../../../src/ui/lib/draw-canvas-stubs'
import {
  areAssetImageMapsEqual,
  collectDlimgAssetKeys,
  collectDlimgAssetKeysFromElements,
  loadAssetImageMap,
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
      new Map([['missing-preview.ttf', 'oepl-font-missing-preview-ttf']]),
    )

    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.font).toBe('16px oepl-font-missing-preview-ttf, sans-serif')
  })
})
