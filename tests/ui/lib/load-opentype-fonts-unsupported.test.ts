/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { resetContentMap, setAsset } from '../../../src/core'
import { clearOpentypeFontCacheForTests, loadOpentypeFontMapWithOutcomes } from '../../../src/ui/lib/load-opentype-fonts'
import { bundledFontPath } from '../../core/renderer/font-test-utils'

describe('loadOpentypeFontMapWithOutcomes unsupported formats', () => {
  afterEach(() => {
    resetContentMap()
    clearOpentypeFontCacheForTests()
  })

  it('fails woff keys referenced in yaml with a clear message', async () => {
    const buffer = readFileSync(bundledFontPath('ppb.ttf'))
    setAsset('Legacy.woff', {
      blob: new Blob([buffer], { type: 'font/woff' }),
      mime: 'font/woff',
    })

    const result = await loadOpentypeFontMapWithOutcomes(['Legacy.woff'])
    expect(result.outcomes.get('Legacy.woff')).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('.ttf and .otf'),
    })
  })
})
