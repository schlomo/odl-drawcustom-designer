import { afterEach, describe, expect, it } from 'vitest'
import type { DrawElement } from '../../../src/core'
import { listContentMapKeys, resetContentMap, setAsset } from '../../../src/core'
import { buildContentAssetRows } from '../../../src/ui/lib/content-asset-rows'

const elementsWithImage: DrawElement[] = [
  {
    type: 'dlimg',
    url: '/local/logo.png',
    x: 0,
    y: 0,
    xsize: 10,
    ysize: 10,
  },
]

describe('buildContentAssetRows', () => {
  afterEach(() => {
    resetContentMap()
  })

  it('returns only YAML-referenced assets in current scope', () => {
    setAsset('/local/other.png', { blob: new Blob(['x']), mime: 'image/png' })

    expect(buildContentAssetRows(elementsWithImage, 'current').map((row) => row.key)).toEqual([
      '/local/logo.png',
    ])
  })

  it('returns stored assets in all scope even when not referenced', () => {
    setAsset('/local/other.png', { blob: new Blob(['x']), mime: 'image/png' })

    expect(buildContentAssetRows(elementsWithImage, 'all').map((row) => row.key)).toEqual([
      '/local/other.png',
    ])
  })
})

describe('listContentMapKeys', () => {
  afterEach(() => {
    resetContentMap()
  })

  it('lists uploaded asset keys sorted', () => {
    setAsset('z.ttf', { blob: new Blob(['z']), mime: 'font/ttf' })
    setAsset('a.png', { blob: new Blob(['a']), mime: 'image/png' })

    expect(listContentMapKeys()).toEqual(['a.png', 'z.ttf'])
  })
})
