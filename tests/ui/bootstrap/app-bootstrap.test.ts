import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppBootstrap,
  loadAppBootstrap,
  resolveCanvasForLoad,
  resolveElementsForLoad,
} from '../../../src/ui/bootstrap/appBootstrap'
import {
  buildSharePayload,
  decodeShareHash,
  encodeShareHash,
} from '../../../src/share'
import type { SessionSnapshot } from '../../../src/storage'
import { SHOWCASE_CANVAS, SHOWCASE_ELEMENTS } from '../../../src/ui/data/showcase'

function sessionWithElements(elements: SessionSnapshot['elements']): SessionSnapshot {
  return {
    id: 'current',
    name: 'Saved',
    canvas: {
      width: 400,
      height: 300,
      rotation: 0,
      colorMode: 'bwr',
      previewDitherMode: 0,
    },
    elements,
    updatedAt: 1,
  }
}

describe('app bootstrap', () => {
  it('restores sample dashboard when session is missing', () => {
    expect(resolveElementsForLoad(null)).toBe(SHOWCASE_ELEMENTS)
    expect(resolveCanvasForLoad(null)).toBe(SHOWCASE_CANVAS)
    expect(buildAppBootstrap(null, {}).elements).toBe(SHOWCASE_ELEMENTS)
    expect(buildAppBootstrap(null, {}).canvas).toBe(SHOWCASE_CANVAS)
    expect(buildAppBootstrap(null, {}).importSource).toBe('session')
  })

  it('restores sample dashboard when session has no elements', () => {
    const session = sessionWithElements([])
    expect(resolveElementsForLoad(session)).toBe(SHOWCASE_ELEMENTS)
    expect(resolveCanvasForLoad(session)).toBe(SHOWCASE_CANVAS)
    expect(buildAppBootstrap(session, {}).elements).toBe(SHOWCASE_ELEMENTS)
    expect(buildAppBootstrap(session, {}).canvas).toBe(SHOWCASE_CANVAS)
  })

  it('keeps non-empty saved session elements and canvas', () => {
    const elements = [{ type: 'text' as const, value: 'Hello', x: 0, y: 0 }]
    const session = sessionWithElements(elements)
    expect(resolveElementsForLoad(session)).toEqual(elements)
    expect(resolveCanvasForLoad(session)).toEqual(session.canvas)
    expect(buildAppBootstrap(session, {}).elements).toEqual(elements)
    expect(buildAppBootstrap(session, {}).canvas).toEqual(session.canvas)
  })
})

describe('loadAppBootstrap hash precedence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers #d= hash over saved session on load', async () => {
    const payload = buildSharePayload({
      name: 'From hash',
      canvas: {
        width: 200,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Shared', x: 0, y: 0 }],
    })
    const encoded = encodeShareHash(payload)

    const bootstrap = await loadAppBootstrap(`#d=${encoded}`)
    expect(bootstrap.sessionName).toBe('From hash')
    expect(bootstrap.elements).toEqual(payload.elements)
    expect(bootstrap.importSource).toBe('hash')
    expect(decodeShareHash(encoded)?.name).toBe('From hash')
  })

  it('clears #d= from the URL after loading from window.location.hash', async () => {
    const payload = buildSharePayload({
      name: 'From hash',
      canvas: {
        width: 200,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [{ type: 'text', value: 'Shared', x: 0, y: 0 }],
    })
    const encoded = encodeShareHash(payload)
    const replaceState = vi.fn()

    vi.stubGlobal('window', {
      location: {
        hash: `#d=${encoded}`,
        pathname: '/designer',
        search: '',
      },
      history: { replaceState },
    })

    const bootstrap = await loadAppBootstrap()

    expect(bootstrap.importSource).toBe('hash')
    expect(bootstrap.sessionName).toBe('From hash')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/designer')
  })
})

/**
 * Review round on PR #198: autosaved sessions and `#d=` links from before the
 * demo image moved inline still say `url: /local/showcase.png` — a key no tier
 * resolves any more. That exact string is rewritten to the current demo image
 * where payloads enter, so an old session or link keeps showing the demo
 * picture instead of a render error plus a "Missing" Content Manager row.
 */
describe('legacy /local/showcase.png migration', () => {
  const legacyDlimg = { type: 'dlimg' as const, url: '/local/showcase.png', x: 330, y: 260, xsize: 100, ysize: 100 }
  const demoImageUrl = SHOWCASE_ELEMENTS.find((element) => element.type === 'dlimg')!.url

  it('rewrites the legacy demo key in a restored session to the current demo data: URI', () => {
    const bootstrap = buildAppBootstrap(sessionWithElements([legacyDlimg]), {})
    expect(bootstrap.elements).toEqual([{ ...legacyDlimg, url: demoImageUrl }])
  })

  it('rewrites the legacy demo key in a #d= share link too', async () => {
    const payload = buildSharePayload({
      name: 'Old link',
      canvas: { width: 800, height: 480, rotation: 0, colorMode: 'four', previewDitherMode: 0 },
      elements: [legacyDlimg],
    })
    const bootstrap = await loadAppBootstrap(`#d=${encodeShareHash(payload)}`)
    expect(bootstrap.importSource).toBe('hash')
    expect(bootstrap.elements[0]).toMatchObject({ url: demoImageUrl })
  })

  it('leaves every other url alone and returns the same array when nothing matches', () => {
    const own = { ...legacyDlimg, url: '/local/mine.png' }
    const session = sessionWithElements([own])
    expect(buildAppBootstrap(session, {}).elements).toBe(session.elements)
  })
})
