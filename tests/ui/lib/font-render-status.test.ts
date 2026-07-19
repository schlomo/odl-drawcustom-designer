import { afterEach, describe, expect, it } from 'vitest'
import {
  clearFontRegistry,
  clearImageAvailabilityRegistry,
  markFontUnavailable,
  markImageUnavailable,
  registerFont,
  unregisterFont,
  type DrawElement,
  type RenderContext,
} from '../../../src/core'
import type { FontLoadOutcome } from '../../../src/ui/lib/font-load-outcome'
import { getFontStatusMessages } from '../../../src/ui/lib/font-readiness'
import { getImageStatusMessages } from '../../../src/ui/lib/image-readiness'
import { getRenderErrorStatusMessages } from '../../../src/ui/lib/render-error-messages'
import { getMergedStatusMessages } from '../../../src/ui/lib/font-render-status'

/**
 * Maintainer manual-test finding on PR #54: a single missing-font failure
 * produced TWO overlapping banners — a font-level "Font not available"
 * banner (font-readiness.ts) and a per-element "Element N could not be
 * rendered" banner (render-error-messages.ts) whose message text is that
 * SAME font's unavailable message (issue #53's renderText/renderMultiline
 * throw it verbatim). Maintainer ruling: one failure = one banner.
 */
describe('one font-unavailable failure produces exactly one banner', () => {
  const KEY = 'issue53-dup-banner.ttf'
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }
  const element: DrawElement = { type: 'text', value: 'Hello', x: 0, y: 0, font: KEY }
  const outcomes = new Map([
    [KEY, { key: KEY, status: 'missing' as const, message: `${KEY} is not uploaded.` }],
  ])

  afterEach(() => clearFontRegistry())

  it("[documents today's bug] the two separate builders each independently emit a banner for the same key", () => {
    markFontUnavailable(KEY, `${KEY} is not uploaded.`)

    const fontMessages = getFontStatusMessages([element], outcomes, false)
    const renderMessages = getRenderErrorStatusMessages([element], ctx)
    const mentionsKey = (message: { summary: string }) => message.summary.includes(KEY)

    // This is what DesignerCanvas currently does: concatenate both arrays.
    expect([...fontMessages, ...renderMessages].filter(mentionsKey)).toHaveLength(2)
  })

  it('the merged builder collapses the same failure into exactly one banner naming the font and the element', () => {
    markFontUnavailable(KEY, `${KEY} is not uploaded.`)

    const messages = getMergedStatusMessages([element], ctx, outcomes, false)
    const mentionsKey = (message: { summary: string }) => message.summary.includes(KEY)
    const matches = messages.filter(mentionsKey)

    expect(matches).toHaveLength(1)
    expect(matches[0]?.summary).toMatch(/element 1/i)
    expect(matches[0]?.severity).toBe('error')
  })

  it('merges multiple elements sharing the same missing font into one banner naming all of them', () => {
    markFontUnavailable(KEY, `${KEY} is not uploaded.`)
    const elements: DrawElement[] = [
      { type: 'text', value: 'A', x: 0, y: 0, font: KEY },
      { type: 'text', value: 'B', x: 0, y: 0, font: 'ppb.ttf' },
      { type: 'text', value: 'C', x: 0, y: 0, font: KEY },
    ]

    const messages = getMergedStatusMessages(elements, ctx, outcomes, false)
    const mentionsKey = (message: { summary: string }) => message.summary.includes(KEY)
    const matches = messages.filter(mentionsKey)

    expect(matches).toHaveLength(1)
    expect(matches[0]?.summary).toMatch(/elements 1 and 3/i)
  })

  it('leaves a render error unrelated to any font-unavailable outcome as its own standalone banner', () => {
    // A font that IS registered (getFont() succeeds) but is not a real
    // opentype.Font object still throws inside layoutTextBlock — a render
    // failure with a completely different root cause than "font
    // missing/failed". No outcome is recorded for this key at all (it never
    // went through the missing/failed/loading pipeline), so the merge logic
    // must not touch it: it must survive as the plain "Element failed to
    // render" banner.
    const brokenKey = 'issue53-broken-not-missing.ttf'
    registerFont(brokenKey, {} as never)
    const noOutcomes = new Map<string, FontLoadOutcome>()
    const brokenElement: DrawElement = { type: 'text', value: 'Hello', x: 0, y: 0, font: brokenKey }

    try {
      const messages = getMergedStatusMessages([brokenElement], ctx, noOutcomes, false)
      const standalone = messages.filter((message) => message.title === 'Element failed to render')
      expect(standalone).toHaveLength(1)
      expect(standalone[0]?.summary).toMatch(/element 1/i)
      // Not re-labelled as a font banner — the outcome for this key is 'ready'.
      expect(messages.some((message) => message.title === 'Font not available')).toBe(false)
    } finally {
      unregisterFont(brokenKey)
    }
  })
})

describe('font-bearing element types beyond text/multiline also merge into one attributed banner', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }
  const KEY = 'issue53-plot-dup-banner.ttf'

  afterEach(() => clearFontRegistry())

  it('a plot with a confirmed-missing font gets one banner naming the element (not the old unattributed font-only banner)', () => {
    markFontUnavailable(KEY, `${KEY} is not uploaded.`)
    const outcomes = new Map([[KEY, { key: KEY, status: 'missing' as const, message: `${KEY} is not uploaded.` }]])
    const element: DrawElement = { type: 'plot', data: [{ entity: 'sensor.x' }], font: KEY }

    const messages = getMergedStatusMessages([element], ctx, outcomes, false)
    const matches = messages.filter((message) => message.summary.includes(KEY))

    expect(matches).toHaveLength(1)
    expect(matches[0]?.summary).toMatch(/element 1/i)
  })
})

/**
 * Issue #55: same "one failure = one banner" ruling, for dlimg images. A
 * confirmed-missing/failed image now throws in renderDlimg (mirroring the
 * font fix), so the same duplicate-banner risk exists: an "Image not
 * available"/"Image failed to load" banner (image-readiness.ts) plus a
 * separate "Element N could not be rendered" banner, for the same failure.
 */
describe('one image-unavailable failure produces exactly one banner (issue #55)', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }
  const URL = '/local/issue55-dup-banner.png'

  afterEach(() => clearImageAvailabilityRegistry())

  it("[documents today's shape] a missing image's own status banner and its render-error banner are two separate entries when not merged", () => {
    markImageUnavailable(URL, `${URL} is not uploaded.`)
    const imageOutcomes = new Map([
      [URL, { key: URL, status: 'missing' as const, message: `${URL} is not uploaded.` }],
    ])
    const element: DrawElement = { type: 'dlimg', url: URL, x: 0, y: 0, xsize: 10, ysize: 10 }

    const imageMessages = getImageStatusMessages([element], imageOutcomes)
    const renderMessages = getRenderErrorStatusMessages([element], ctx)
    const mentionsUrl = (message: { summary: string }) => message.summary.includes(URL)

    expect([...imageMessages, ...renderMessages].filter(mentionsUrl)).toHaveLength(2)
  })

  it('the merged builder collapses a missing image into exactly one banner naming the asset and the element', () => {
    markImageUnavailable(URL, `${URL} is not uploaded.`)
    const imageOutcomes = new Map([
      [URL, { key: URL, status: 'missing' as const, message: `${URL} is not uploaded.` }],
    ])
    const element: DrawElement = { type: 'dlimg', url: URL, x: 0, y: 0, xsize: 10, ysize: 10 }

    const messages = getMergedStatusMessages(
      [element],
      ctx,
      new Map(),
      false,
      imageOutcomes,
    )
    const matches = messages.filter((message) => message.summary.includes(URL))

    expect(matches).toHaveLength(1)
    // Pre-fix, getMergedStatusMessages never consults image outcomes at all,
    // so this would surface only as the generic standalone "Element failed
    // to render" banner (the render-error message happens to contain the
    // URL too) — not the richer, dedicated "Image not available" banner
    // that names the asset explicitly, mirroring the font case.
    expect(matches[0]?.title).toBe('Image not available')
    expect(matches[0]?.summary).toMatch(/element 1/i)
    expect(matches[0]?.severity).toBe('error')
    // The generic standalone banner must NOT also be present — genuinely
    // one banner, not the fallback title dressed up.
    expect(messages.some((message) => message.title === 'Element failed to render')).toBe(false)
  })

  it('does not touch a suppressed (dismissed bundled demo) image outcome — no banner, no merge', () => {
    const element: DrawElement = {
      type: 'dlimg',
      url: '/local/showcase.png',
      x: 0,
      y: 0,
      xsize: 10,
      ysize: 10,
    }
    const imageOutcomes = new Map([
      ['/local/showcase.png', { key: '/local/showcase.png', status: 'suppressed' as const }],
    ])

    const messages = getMergedStatusMessages([element], ctx, new Map(), false, imageOutcomes)
    expect(messages).toHaveLength(0)
  })

  /**
   * Independent review finding on PR #58 (cheap hardening): `mergeAssetFailures`
   * must keep skipping any outcome status other than 'missing'/'failed' even
   * as the status unions grow in the future, so a hypothetical new status
   * never silently flows into `buildMessage` (which only knows how to label
   * exactly those two cases) and gets mislabeled.
   */
  it('never merges or mislabels an outcome whose status is neither missing nor failed, even with a matching render error', () => {
    markImageUnavailable(URL, `${URL} is not uploaded.`)
    // A deliberately out-of-union status value, simulating a future addition
    // nobody has taught mergeAssetFailures about yet.
    const weirdOutcomes = new Map([
      [URL, { key: URL, status: 'not-a-real-status' } as unknown as { key: string; status: 'missing' | 'failed' | 'ready' | 'suppressed' }],
    ])
    const element: DrawElement = { type: 'dlimg', url: URL, x: 0, y: 0, xsize: 10, ysize: 10 }

    const messages = getMergedStatusMessages(
      [element],
      ctx,
      new Map(),
      false,
      weirdOutcomes as never,
    )

    // No "Image not available"/"Image failed to load" banner was fabricated
    // for the unrecognized status — at most the generic standalone
    // render-error banner (from the element's own render exception) may
    // appear, never a mislabeled asset-status one.
    expect(messages.some((message) => message.title === 'Image not available')).toBe(false)
    expect(messages.some((message) => message.title === 'Image failed to load')).toBe(false)
  })
})
