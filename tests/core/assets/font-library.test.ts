import { describe, expect, it, beforeEach } from 'vitest'
import { listLibraryFontKeys, resetContentMap, setAsset } from '../../../src/core/assets'

describe('listLibraryFontKeys', () => {
  beforeEach(() => {
    resetContentMap()
  })

  it('includes bundled fonts', () => {
    expect(listLibraryFontKeys()).toEqual(['ppb.ttf', 'rbm.ttf'])
  })

  it('includes uploaded fonts not referenced in the payload', () => {
    setAsset('Comic Sans MS.ttf', {
      blob: new Blob(['font'], { type: 'font/ttf' }),
      mime: 'font/ttf',
    })

    expect(listLibraryFontKeys()).toEqual(['Comic Sans MS.ttf', 'ppb.ttf', 'rbm.ttf'])
  })

  it('ignores uploaded images', () => {
    setAsset('/local/logo.png', {
      blob: new Blob(['png'], { type: 'image/png' }),
      mime: 'image/png',
    })

    expect(listLibraryFontKeys()).toEqual(['ppb.ttf', 'rbm.ttf'])
  })
})
