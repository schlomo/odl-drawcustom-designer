/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearImageAvailabilityRegistry,
  safeRenderElement,
  type DrawElement,
  type RenderContext,
} from '../../../src/core'
import { loadAssetImageMapWithOutcomes } from '../../../src/ui/lib/load-asset-images'

/**
 * Issue #55 (follow-up to #53's font fix): a dlimg element whose `url` has no
 * matching asset in the content map ("missing", per the new
 * `ImageLoadOutcome`, mirroring `FontLoadOutcome`) currently renders a grey
 * dashed placeholder with the truncated URL as a label — no error marker, no
 * status banner, no element attribution. "Plausible but wrong" is too
 * generous a description; it's really just silent, but the maintainer's
 * standing ruling (clear error over wrong/silent render) still applies.
 *
 * An image that is merely still loading (asset exists, fetch/decode in
 * flight) must NOT get the same error treatment — that would flash error
 * markers during ordinary startup, exactly like the font case.
 */
describe('missing vs loading image — render outcome (issue #55)', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }

  afterEach(() => {
    clearImageAvailabilityRegistry()
  })

  it('shows the render-error marker at the declared rectangle once an image is confirmed missing', async () => {
    const url = '/local/never-uploaded-issue55.png'
    const { outcomes } = await loadAssetImageMapWithOutcomes([url])
    expect(outcomes.get(url)).toMatchObject({ status: 'missing' })

    const element: DrawElement = { type: 'dlimg', url, x: 10, y: 20, xsize: 40, ysize: 30 }
    const result = safeRenderElement(element, ctx)

    if (result?.layer !== 'svg' || result.primitive.kind !== 'render-error') {
      throw new Error(
        `expected the dedicated render-error marker for a missing image, got ${JSON.stringify(result)}`,
      )
    }
    expect(result.primitive).toMatchObject({ x: 10, y: 20, width: 40, height: 30 })
    expect(result.primitive.message).toMatch(new RegExp(url.replace(/[/.]/g, '\\$&')))
  })

  it('does not show an error marker while the image is merely loading (no outcome recorded yet)', () => {
    const url = '/local/still-loading-issue55.png'
    const element: DrawElement = { type: 'dlimg', url, x: 10, y: 20, xsize: 40, ysize: 30 }
    const result = safeRenderElement(element, ctx)

    expect(result).not.toBeNull()
    if (result?.layer === 'svg' && result.primitive.kind === 'render-error') {
      throw new Error('unexpected render-error marker while image is only loading, not confirmed missing')
    }
  })
})
