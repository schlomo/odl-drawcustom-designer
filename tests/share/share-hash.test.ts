import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DrawElement } from '../../src/core'
import {
  buildSharePayload,
  buildShareUrl,
  clearShareHashFromLocation,
  decodeShareHash,
  encodeShareHash,
  parseShareHashFromLocation,
  sharePayloadToBootstrap,
} from '../../src/share'

const sampleElements: DrawElement[] = [
  { type: 'text', value: 'Hello', x: 10, y: 20 },
]

describe('share hash encode/decode', () => {
  it('round-trips a v1 payload', () => {
    const payload = buildSharePayload({
      name: 'My design',
      canvas: {
        width: 296,
        height: 128,
        rotation: 90,
        colorMode: 'bwy',
        previewDitherMode: 2,
      },
      service: { background: 'white', dither: 2 },
      elements: sampleElements,
    })

    const encoded = encodeShareHash(payload)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')

    const decoded = decodeShareHash(encoded)
    expect(decoded).toEqual(payload)
  })

  it('excludes assets and mock state from the payload shape', () => {
    const payload = buildSharePayload({
      name: 'Untitled',
      canvas: {
        width: 384,
        height: 184,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: sampleElements,
    })

    expect(payload).toEqual({
      v: 1,
      name: 'Untitled',
      canvas: { width: 384, height: 184, rotation: 0, accent: 'red', colorMode: 'bwr' },
      elements: sampleElements,
    })
    expect('assets' in payload).toBe(false)
    expect('mocks' in payload).toBe(false)
    expect('history' in payload).toBe(false)
  })

  it('includes service options when present', () => {
    const payload = buildSharePayload({
      name: 'Svc',
      canvas: {
        width: 100,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      service: { background: 'black', rotate: 180, dither: 0 },
      elements: [],
    })

    expect(decodeShareHash(encodeShareHash(payload))).toEqual(payload)
  })

  it('maps preview dither mode into service.dither for share', () => {
    const payload = buildSharePayload({
      name: 'Dither',
      canvas: {
        width: 100,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 2,
      },
      elements: [],
    })

    expect(payload.service).toEqual({ dither: 2 })
  })

  it('rejects malformed hash fragments', () => {
    expect(decodeShareHash('not-valid-base64!!!')).toBeNull()
    expect(decodeShareHash('')).toBeNull()
  })

  it('rejects unsupported payload versions', () => {
    const payload = buildSharePayload({
      name: 'Old',
      canvas: {
        width: 100,
        height: 100,
        rotation: 0,
        colorMode: 'bwr',
        previewDitherMode: 0,
      },
      elements: [],
    })
    const encoded = encodeShareHash({ ...payload, v: 2 as 1 })
    expect(decodeShareHash(encoded)).toBeNull()
  })
})

describe('buildShareUrl', () => {
  it('uses origin, pathname, and #d= fragment', () => {
    const url = buildShareUrl('abc123', {
      origin: 'https://example.com',
      pathname: '/tools/odl-drawcustom-designer/',
    })
    expect(url).toBe('https://example.com/tools/odl-drawcustom-designer/#d=abc123')
  })
})

describe('parseShareHashFromLocation', () => {
  it('reads #d= from a hash string', () => {
    expect(parseShareHashFromLocation('#d=hello')).toBe('hello')
    expect(parseShareHashFromLocation('')).toBeNull()
    expect(parseShareHashFromLocation('#other=1')).toBeNull()
  })
})

describe('clearShareHashFromLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('strips #d= from the address bar while keeping path and query', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: {
        hash: '#d=abc123',
        pathname: '/tools/odl-drawcustom-designer/',
        search: '?ref=1',
      },
      history: { replaceState },
    })

    clearShareHashFromLocation()

    expect(replaceState).toHaveBeenCalledWith(null, '', '/tools/odl-drawcustom-designer/?ref=1')
  })

  it('does nothing when there is no share hash', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: {
        hash: '#other=1',
        pathname: '/',
        search: '',
      },
      history: { replaceState },
    })

    clearShareHashFromLocation()

    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('sharePayloadToBootstrap', () => {
  it('maps accent and preview dither from service.dither', () => {
    const payload = buildSharePayload({
      name: 'Shared',
      canvas: {
        width: 200,
        height: 100,
        rotation: 270,
        colorMode: 'bwy',
        previewDitherMode: 2,
      },
      service: { dither: 2 },
      elements: sampleElements,
    })

    const bootstrap = sharePayloadToBootstrap(payload, {
      states: { demo: 'unknown' },
      attributes: {},
    })
    expect(bootstrap.sessionName).toBe('Shared')
    expect(bootstrap.canvas).toEqual({
      width: 200,
      height: 100,
      rotation: 270,
      colorMode: 'bwy',
      previewDitherMode: 2,
    })
    expect(bootstrap.service).toEqual({ dither: 2 })
    expect(bootstrap.elements).toEqual(sampleElements)
    expect(bootstrap.mockStates).toEqual({ demo: 'unknown' })
    expect(bootstrap.importSource).toBe('hash')
  })

  it('derives colorMode from share accent when colorMode is omitted', () => {
    const payload = {
      v: 1 as const,
      name: 'Legacy',
      canvas: { width: 200, height: 100, rotation: 0, accent: 'yellow' as const },
      elements: sampleElements,
    }

    const bootstrap = sharePayloadToBootstrap(payload, { states: {}, attributes: {} })
    expect(bootstrap.canvas.colorMode).toBe('bwy')
  })

  it('restores bw color mode from share payload', () => {
    const payload = buildSharePayload({
      name: 'Mono',
      canvas: {
        width: 200,
        height: 200,
        rotation: 0,
        colorMode: 'bw',
        previewDitherMode: 0,
      },
      elements: [],
    })

    const bootstrap = sharePayloadToBootstrap(payload, { states: {}, attributes: {} })
    expect(bootstrap.canvas.colorMode).toBe('bw')
  })
})
