import { afterEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_FONT_KEYS,
  BUNDLED_SHOWCASE_IMAGE_KEY,
  deleteAsset,
  loadAssetsIntoContentMap,
  listContentMapKeys,
  resolveAsset,
  resetContentMap,
  setAsset,
} from '../../../src/core/assets'

describe('resolveAsset', () => {
  afterEach(() => {
    resetContentMap()
  })

  it('reports bundled default fonts as resolved without upload', () => {
    for (const key of BUNDLED_FONT_KEYS) {
      expect(resolveAsset(key)).toEqual({ key, status: 'bundled' })
    }
  })

  it('reports the bundled showcase image without upload', () => {
    expect(resolveAsset(BUNDLED_SHOWCASE_IMAGE_KEY)).toEqual({
      key: BUNDLED_SHOWCASE_IMAGE_KEY,
      status: 'bundled',
    })
  })

  it('returns resolved entries from the in-memory content map', () => {
    const blob = new Blob(['font-bytes'], { type: 'font/ttf' })
    setAsset('CustomFont.ttf', { blob, mime: 'font/ttf' })

    expect(resolveAsset('CustomFont.ttf')).toEqual({
      key: 'CustomFont.ttf',
      status: 'resolved',
      blob,
      mime: 'font/ttf',
    })
  })

  it('returns missing for unknown keys that are not bundled defaults', () => {
    expect(resolveAsset('/local/missing.png')).toEqual({
      key: '/local/missing.png',
      status: 'missing',
    })
  })

  it('prefers user-uploaded map entries over bundled defaults', () => {
    const blob = new Blob(['override'], { type: 'font/ttf' })
    setAsset('ppb.ttf', { blob, mime: 'font/ttf' })

    expect(resolveAsset('ppb.ttf')).toEqual({
      key: 'ppb.ttf',
      status: 'resolved',
      blob,
      mime: 'font/ttf',
    })
  })

  it('deleteAsset removes uploaded entries so bundled fallback applies again', () => {
    const blob = new Blob(['override'], { type: 'font/ttf' })
    setAsset('rbm.ttf', { blob, mime: 'font/ttf' })
    deleteAsset('rbm.ttf')

    expect(resolveAsset('rbm.ttf')).toEqual({ key: 'rbm.ttf', status: 'bundled' })
  })

  it('loadAssetsIntoContentMap replaces the in-memory map', () => {
    setAsset('old.ttf', { blob: new Blob(['old']), mime: 'font/ttf' })
    const blob = new Blob(['new'], { type: 'font/ttf' })

    loadAssetsIntoContentMap([{ key: 'new.ttf', entry: { blob, mime: 'font/ttf' } }])

    expect(resolveAsset('old.ttf').status).toBe('missing')
    expect(resolveAsset('new.ttf').status).toBe('resolved')
  })

  it('listContentMapKeys returns sorted uploaded keys', () => {
    setAsset('b.png', { blob: new Blob(['b']), mime: 'image/png' })
    setAsset('a.ttf', { blob: new Blob(['a']), mime: 'font/ttf' })

    expect(listContentMapKeys()).toEqual(['a.ttf', 'b.png'])
  })
})
