/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearFontRegistry,
  deleteAsset,
  fontUnavailableMessage,
  getFont,
  markFontUnavailable,
  resetContentMap,
  setAsset,
} from '../../../src/core'
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

/**
 * Copilot review comment 3610491466 on PR #54: `clearFontUnavailable` only
 * ran in `readyOutcome()`, i.e. after a load settles successfully. For the
 * missing -> upload -> reload sequence, that leaves the stale "confirmed
 * unavailable" mark from the previous failure in place for the *entire*
 * async fetch/parse window of the retry — so the canvas keeps showing the
 * render-error placeholder while the font is genuinely (successfully)
 * loading, violating this PR's own "no error while merely loading" contract.
 *
 * The mark must clear as soon as the asset is known to resolve, before any
 * `await` — not only once the load fully settles.
 */
describe('stale unavailable mark clears as soon as the retry starts (not only once it settles)', () => {
  afterEach(() => {
    resetContentMap()
    clearOpentypeFontCacheForTests()
    clearFontRegistry()
  })

  it('clears a stale mark during the in-flight window once the asset resolves (missing -> upload -> reload)', () => {
    const key = 'issue53-stale-mark-upload.ttf'
    markFontUnavailable(key, 'stale: previously missing')
    uploadBundledFontAs(key)

    // Do not await yet — assert the state during the async load's in-flight
    // window, which is exactly the window the render path checks while the
    // font is "loading".
    const pending = loadOpentypeFontMapWithOutcomes([key])
    expect(fontUnavailableMessage(key)).toBeUndefined()

    return pending
  })

  it('keeps the mark for a key that is still missing at load start (no reverse flicker)', () => {
    const key = 'issue53-stale-mark-still-missing.ttf'
    markFontUnavailable(key, 'stale: previously missing')

    // A genuinely-still-missing key resolves synchronously to its own fresh
    // "missing" outcome here (no asset to await), which is fine and expected
    // — the message text may update, but the mark itself must never become
    // absent, or renderText/renderMultiline would briefly show the
    // wrong-metrics fallback instead of the error placeholder (the reverse
    // flicker this fix must not introduce).
    const pending = loadOpentypeFontMapWithOutcomes([key])
    expect(fontUnavailableMessage(key)).toBeTruthy()

    return pending
  })
})
