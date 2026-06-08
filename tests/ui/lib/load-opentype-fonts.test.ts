/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteAsset, resetContentMap, setAsset } from '../../../src/core/assets'
import { getFont } from '../../../src/core/renderer/fonts'
import { bundledFontPath } from '../../core/renderer/font-test-utils'
import {
  clearOpentypeFontCacheForTests,
  loadOpentypeFontMapWithOutcomes,
} from '../../../src/ui/lib/load-opentype-fonts'

const FONT_KEY = 'Times New Roman.ttf'

function uploadBundledFontAs(key: string): void {
  const buffer = readFileSync(bundledFontPath('ppb.ttf'))
  setAsset(key, {
    blob: new Blob([buffer], { type: 'font/ttf' }),
    mime: 'font/ttf',
  })
}

describe('loadOpentypeFontMapWithOutcomes', () => {
  afterEach(() => {
    resetContentMap()
    clearOpentypeFontCacheForTests()
  })

  it('reports missing for fonts that were uploaded then deleted', async () => {
    uploadBundledFontAs(FONT_KEY)

    const first = await loadOpentypeFontMapWithOutcomes([FONT_KEY])
    expect(first.outcomes.get(FONT_KEY)).toMatchObject({ status: 'ready' })
    expect(first.fonts.has(FONT_KEY)).toBe(true)

    deleteAsset(FONT_KEY)

    const second = await loadOpentypeFontMapWithOutcomes([FONT_KEY])
    expect(second.outcomes.get(FONT_KEY)).toMatchObject({
      status: 'missing',
      message: expect.stringContaining('not uploaded'),
    })
    expect(second.fonts.has(FONT_KEY)).toBe(false)
    expect(getFont(FONT_KEY)).toBeUndefined()
  })

  it('reports missing for fonts that were never uploaded', async () => {
    const result = await loadOpentypeFontMapWithOutcomes(['NeverUploaded.ttf'])
    expect(result.outcomes.get('NeverUploaded.ttf')).toMatchObject({ status: 'missing' })
  })
})
