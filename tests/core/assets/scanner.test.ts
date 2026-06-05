import { describe, expect, it } from 'vitest'
import { scanPayloadForAssets } from '../../../src/core/assets'
import type { DrawElement } from '../../../src/core/schema/elements'

describe('scanPayloadForAssets', () => {
  it('finds font keys on text, multiline, plot, progress_bar, and debug_grid', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: 'Hello',
        x: 0,
        y: 0,
        font: 'ppb.ttf',
      },
      {
        type: 'multiline',
        value: 'a|b',
        delimiter: '|',
        x: 0,
        offset_y: 10,
        font: '/media/custom.ttf',
      },
      {
        type: 'plot',
        data: [{ entity: 'sensor.power' }],
        font: 'rbm.ttf',
      },
      {
        type: 'progress_bar',
        x_start: 0,
        y_start: 0,
        x_end: 100,
        y_end: 20,
        progress: 50,
        font: 'CustomFont.ttf',
      },
      {
        type: 'debug_grid',
        font: '/media/labels.ttf',
      },
    ]

    const result = scanPayloadForAssets(payload)

    expect(result.keys).toEqual([
      '/media/custom.ttf',
      '/media/labels.ttf',
      'CustomFont.ttf',
      'ppb.ttf',
      'rbm.ttf',
    ])
    expect(result.references.map((ref) => ref.path)).toEqual([
      '[0].font',
      '[1].font',
      '[2].font',
      '[3].font',
      '[4].font',
    ])
    expect(result.references.every((ref) => ref.kind === 'font')).toBe(true)
  })

  it('finds dlimg url keys using the exact string value', () => {
    const payload: DrawElement[] = [
      {
        type: 'dlimg',
        url: '/local/logo.png',
        x: 0,
        y: 0,
        xsize: 64,
        ysize: 64,
      },
      {
        type: 'dlimg',
        url: 'https://example.com/image.png',
        x: 10,
        y: 10,
        xsize: 32,
        ysize: 32,
      },
    ]

    const result = scanPayloadForAssets(payload)

    expect(result.keys).toEqual(['/local/logo.png', 'https://example.com/image.png'])
    expect(result.references).toEqual([
      { path: '[0].url', key: '/local/logo.png', kind: 'image' },
      { path: '[1].url', key: 'https://example.com/image.png', kind: 'image' },
    ])
  })

  it('deduplicates keys referenced from multiple elements', () => {
    const payload: DrawElement[] = [
      {
        type: 'text',
        value: 'A',
        x: 0,
        y: 0,
        font: 'ppb.ttf',
      },
      {
        type: 'text',
        value: 'B',
        x: 0,
        y: 10,
        font: 'ppb.ttf',
      },
      {
        type: 'dlimg',
        url: '/local/logo.png',
        x: 0,
        y: 0,
        xsize: 10,
        ysize: 10,
      },
      {
        type: 'dlimg',
        url: '/local/logo.png',
        x: 20,
        y: 0,
        xsize: 10,
        ysize: 10,
      },
    ]

    const result = scanPayloadForAssets(payload)

    expect(result.keys).toEqual(['/local/logo.png', 'ppb.ttf'])
    expect(result.references).toHaveLength(4)
  })

  it('ignores elements without font fields and skips template strings', () => {
    const payload: DrawElement[] = [
      {
        type: 'rectangle',
        x_start: 0,
        x_end: 10,
        y_start: 0,
        y_end: 10,
      },
      {
        type: 'text',
        value: 'Static',
        x: 0,
        y: 0,
      },
      {
        type: 'dlimg',
        url: "{{ states('camera.front_door') }}",
        x: 0,
        y: 0,
        xsize: 10,
        ysize: 10,
      },
      {
        type: 'text',
        value: 'Templated font',
        x: 0,
        y: 0,
        font: "{{ '/local/' ~ states('input_text.logo') ~ '.png' }}",
      },
    ]

    const result = scanPayloadForAssets(payload)

    expect(result.keys).toEqual([])
    expect(result.references).toEqual([])
  })

  it('returns empty results for an empty payload', () => {
    expect(scanPayloadForAssets([])).toEqual({ references: [], keys: [] })
  })
})
