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
