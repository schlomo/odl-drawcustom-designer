import { afterEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_FONT_KEYS,
  deleteAsset,
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
})
