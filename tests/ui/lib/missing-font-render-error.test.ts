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
