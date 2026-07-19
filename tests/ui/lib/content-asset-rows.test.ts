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

    expect(buildContentAssetRows(elementsWithImage, 'all').map((row) => row.key)).toEqual(
      expect.arrayContaining(['/local/other.png']),
    )
  })

  /**
   * Maintainer manual-test finding on PR #54: a font referenced by an
   * element but never uploaded shows under "Current" with a MISSING badge,
   * but disappears entirely from "All" — where only stored assets appear
   * (e.g. a stored, unreferenced image shows RESOLVED). "All" reading as a
   * superset of "Current" is the natural expectation; a referenced key
   * vanishing when switching to "All" reads as a bug, not a feature.
   *
   * "All" must be a true superset: every key in "Current" (referenced,
   * whether stored or not) UNION every key stored in the content map
   * (whether referenced or not).
   */
  it('is a true superset of "current": includes a referenced-but-missing font alongside stored assets', () => {
    setAsset('/local/other.png', { blob: new Blob(['x']), mime: 'image/png' })

    const elements: DrawElement[] = [
      {
        type: 'dlimg',
        url: '/local/logo.png', // referenced, never uploaded — "missing"
        x: 0,
        y: 0,
        xsize: 10,
        ysize: 10,
      },
    ]

    const allRows = buildContentAssetRows(elements, 'all')
    const byKey = new Map(allRows.map((row) => [row.key, row]))

    // The stored-but-unreferenced image is present (pre-existing behavior).
    expect(byKey.get('/local/other.png')).toMatchObject({ status: 'resolved' })
    // The referenced-but-never-uploaded key must ALSO be present, with the
    // same MISSING status "Current" already shows for it — not silently
    // dropped just because the scope switched to "All".
    expect(byKey.get('/local/logo.png')).toMatchObject({ status: 'missing', kind: 'image' })
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
