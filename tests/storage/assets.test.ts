import { afterEach, describe, expect, it } from 'vitest'
import { resetContentMap, resolveAsset } from '../../src/core/assets'
import {
  deleteStoredAsset,
  getStoredAsset,
  hydrateContentMapFromStorage,
  persistAsset,
  putStoredAsset,
  removePersistedAsset,
} from '../../src/storage/assets'

describe('asset storage adapter', () => {
  afterEach(() => {
    resetContentMap()
  })

  it('round-trips assets through IndexedDB', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    await putStoredAsset('/local/logo.png', { blob, mime: 'image/png' })

    const stored = await getStoredAsset('/local/logo.png')
    expect(stored?.key).toBe('/local/logo.png')
    expect(stored?.mime).toBe('image/png')
    expect(await stored?.blob.text()).toBe('png-bytes')
    expect(stored?.updatedAt).toBeTypeOf('number')
  })

  it('hydrates the in-memory content map from IndexedDB', async () => {
    const blob = new Blob(['font-bytes'], { type: 'font/ttf' })
    await putStoredAsset('CustomFont.ttf', { blob, mime: 'font/ttf' })

    await hydrateContentMapFromStorage()

    expect(resolveAsset('CustomFont.ttf')).toEqual({
      key: 'CustomFont.ttf',
      status: 'resolved',
      blob,
      mime: 'font/ttf',
    })
  })

  it('persistAsset updates IndexedDB and the sync resolver', async () => {
    const blob = new Blob(['data'], { type: 'image/png' })
    await persistAsset('/local/icon.png', { blob, mime: 'image/png' })

    const stored = await getStoredAsset('/local/icon.png')
    expect(stored?.mime).toBe('image/png')
    expect(resolveAsset('/local/icon.png').status).toBe('resolved')
  })

  it('removePersistedAsset clears IndexedDB and the sync resolver', async () => {
    const blob = new Blob(['data'], { type: 'font/ttf' })
    await persistAsset('rbm.ttf', { blob, mime: 'font/ttf' })
    await removePersistedAsset('rbm.ttf')

    expect(await getStoredAsset('rbm.ttf')).toBeUndefined()
    expect(resolveAsset('rbm.ttf')).toEqual({ key: 'rbm.ttf', status: 'bundled' })
  })

  it('deleteStoredAsset removes only IndexedDB rows', async () => {
    await putStoredAsset('/local/x.png', {
      blob: new Blob(['x']),
      mime: 'image/png',
    })
    await deleteStoredAsset('/local/x.png')
    expect(await getStoredAsset('/local/x.png')).toBeUndefined()
  })
})
