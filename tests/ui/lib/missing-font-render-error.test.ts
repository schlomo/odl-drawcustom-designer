/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { clearFontRegistry, safeRenderElement, type DrawElement, type RenderContext } from '../../../src/core'
import {
  clearOpentypeFontCacheForTests,
  loadOpentypeFontMapWithOutcomes,
} from '../../../src/ui/lib/load-opentype-fonts'

/**
 * Issue #53: a text element whose font key has no matching asset in the
 * content map ("missing", per FontLoadOutcome) currently renders with a
 * fallback font at the fallback font's metrics — glyphs vertically offset
 * from the element's real bounds, "plausible but wrong" per the maintainer's
 * standing ruling (clear error over wrong render, established for #10/#51).
 *
 * A font that is merely still loading (asset exists, fetch/parse in flight)
 * must NOT get the same error treatment — that would flash error markers
 * during ordinary startup, which the issue explicitly rules out.
 */
describe('missing vs loading font — render outcome (issue #53)', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }

  afterEach(() => {
    clearFontRegistry()
    clearOpentypeFontCacheForTests()
  })

  it('shows the render-error marker, not a wrong-metrics text-stub, once a font is confirmed missing', async () => {
    const key = 'NeverUploaded-issue53.ttf'
    const { outcomes } = await loadOpentypeFontMapWithOutcomes([key])
    expect(outcomes.get(key)).toMatchObject({ status: 'missing' })

    const element: DrawElement = { type: 'text', value: 'Hello', x: 10, y: 10, font: key }
    const result = safeRenderElement(element, ctx)

    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(
        `expected the dedicated render-error marker for a missing font, got ${JSON.stringify(result)}`,
      )
    }
    expect(result.primitive.message).toMatch(new RegExp(key.replace('.', '\\.')))
  })

  it('shows the render-error marker for multiline elements too, once a font is confirmed missing', async () => {
    const key = 'NeverUploaded-issue53-multiline.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'multiline',
      value: 'Hello\nWorld',
      delimiter: '\n',
      x: 10,
      y: 10,
      offset_y: 0,
      font: key,
    }
    const result = safeRenderElement(element, ctx)

    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(
        `expected the dedicated render-error marker for a missing font, got ${JSON.stringify(result)}`,
      )
    }
  })

  it('does not show an error marker while the font is merely loading (no outcome recorded yet)', () => {
    const key = 'still-loading-issue53.ttf'
    const element: DrawElement = { type: 'text', value: 'Hello', x: 10, y: 10, font: key }
    const result = safeRenderElement(element, ctx)

    expect(result).not.toBeNull()
    if (result?.layer === 'svg' && result.primitive.kind === 'render-error') {
      throw new Error('unexpected render-error marker while font is only loading, not confirmed missing')
    }
  })
})

/**
 * Follow-up to the above (maintainer manual test of PR #54): the same
 * "clear error over wrong render" contract must apply uniformly to EVERY
 * font-bearing element type, not just text/multiline. `plot`, `debug_grid`
 * (label font), and `progress_bar` (percentage font) all have a `font`
 * field but, unlike text/multiline, never call `getFont()` in their core
 * renderers at all — they just pass the font KEY string through to the
 * primitive, and the actual glyph painting happens via a browser
 * CSS-font-family / canvas `ctx.font` fallback at the UI paint layer. That
 * means a confirmed-missing font for these types was previously silently
 * ignored: the WHOLE element (chart, bar, grid) kept rendering normally,
 * with no error marker — only a font-status banner with no per-element
 * attribution (since no render error existed to merge it with).
 *
 * Per the maintainer's ruling, a font affecting only a sub-part of an
 * element (e.g. plot tick labels) still means the WHOLE element gets
 * replaced by the render-error marker — a chart with wrong/absent labels
 * is a wrong render, and a "partial error" presentation would be new,
 * unapproved UX.
 */
describe('every font-bearing element type gets the render-error marker for a confirmed-missing font', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }

  afterEach(() => {
    clearFontRegistry()
    clearOpentypeFontCacheForTests()
  })

  function expectRenderError(result: ReturnType<typeof safeRenderElement>, key: string) {
    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(
        `expected the dedicated render-error marker for a missing font, got ${JSON.stringify(result)}`,
      )
    }
    expect(result.primitive.message).toMatch(new RegExp(key.replace('.', '\\.')))
    return result
  }

  it('plot: replaces the WHOLE chart with the render-error marker (not just the legend labels)', async () => {
    const key = 'NeverUploaded-issue53-plot.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'plot',
      data: [{ entity: 'sensor.temperature' }],
      font: key,
    }
    const result = safeRenderElement(element, ctx)
    expectRenderError(result, key)
  })

  it('debug_grid: replaces the WHOLE grid with the render-error marker when labels are shown with a missing font', async () => {
    const key = 'NeverUploaded-issue53-debuggrid.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'debug_grid',
      show_labels: true,
      font: key,
    }
    const result = safeRenderElement(element, ctx)
    expectRenderError(result, key)
  })

  it('debug_grid: does NOT error when labels are off, even with the same missing font key (font genuinely unused)', async () => {
    const key = 'NeverUploaded-issue53-debuggrid-off.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'debug_grid',
      show_labels: false,
      font: key,
    }
    const result = safeRenderElement(element, ctx)
    if (result?.layer === 'svg' && result.primitive.kind === 'render-error') {
      throw new Error('unexpected render-error marker for a font the element never actually uses')
    }
  })

  it('progress_bar: replaces the WHOLE bar with the render-error marker when the percentage label is shown with a missing font', async () => {
    const key = 'NeverUploaded-issue53-progressbar.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'progress_bar',
      x_start: 0,
      y_start: 0,
      x_end: 100,
      y_end: 20,
      progress: 50,
      show_percentage: true,
      font: key,
    }
    const result = safeRenderElement(element, ctx)
    expectRenderError(result, key)
  })

  it('progress_bar: does NOT error when the percentage label is off, even with the same missing font key', async () => {
    const key = 'NeverUploaded-issue53-progressbar-off.ttf'
    await loadOpentypeFontMapWithOutcomes([key])

    const element: DrawElement = {
      type: 'progress_bar',
      x_start: 0,
      y_start: 0,
      x_end: 100,
      y_end: 20,
      progress: 50,
      show_percentage: false,
      font: key,
    }
    const result = safeRenderElement(element, ctx)
    if (result?.layer === 'svg' && result.primitive.kind === 'render-error') {
      throw new Error('unexpected render-error marker for a font the element never actually uses')
    }
  })
})
