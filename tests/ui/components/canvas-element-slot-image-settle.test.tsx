/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearImageAvailabilityRegistry,
  markImageUnavailable,
  type DrawElement,
  type RenderContext,
} from '../../../src/core'
import { CanvasElementSlot } from '../../../src/ui/components/CanvasElementSlot'
import type { ImageLoadOutcome } from '../../../src/ui/lib/image-load-outcome'

/**
 * Issue #55, mirroring the font fix (PR #54): set a dlimg element's `url` to
 * a nonexistent key — the status banner should update immediately (it reads
 * `imageLoadOutcomes`), and the canvas must swap the stale grey placeholder
 * for the render-error marker the moment the outcome settles, WITHOUT
 * needing an unrelated `elements` change to force a re-render. Same root
 * cause class as the font case: the core image-availability registry's
 * `unavailable` mark is a module-level, non-React-visible side effect;
 * `assetImages` only changes when an image successfully *decodes*, and stays
 * referentially equal otherwise.
 */
describe('CanvasElementSlot re-renders when an image outcome settles, without an elements change', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }
  const URL = 'issue55-stale-canvas.png'

  afterEach(() => {
    clearImageAvailabilityRegistry()
  })

  it('swaps the stale placeholder for the render-error marker the moment the outcome settles to missing', () => {
    // Stable references reused across BOTH renders below — the whole point
    // of this test is that NOTHING in the current (pre-fix) memo dependency
    // array `[element, renderContext, opentypeFonts, fontLoadOutcomes]`
    // changes; only `imageLoadOutcomes` does (a fresh Map, just like
    // DesignerCanvas's setImageLoadOutcomes produces after
    // loadAssetImageMapWithOutcomes resolves). Passing a NEW Map for
    // opentypeFonts/fontLoadOutcomes/assetImages on rerender would trigger
    // the memo to recompute for an unrelated reason and produce a false
    // green — every one of them must be the exact same reference twice.
    const element: DrawElement = { type: 'dlimg', url: URL, x: 10, y: 10, xsize: 40, ysize: 30 }
    const assetImages = new Map<string, HTMLImageElement>()
    const fontFamilies = new Map<string, string>()
    const opentypeFonts = new Map()
    const fontLoadOutcomes = new Map()

    const { container, rerender } = render(
      <CanvasElementSlot
        element={element}
        index={0}
        renderContext={ctx}
        assetImages={assetImages}
        fontFamilies={fontFamilies}
        opentypeFonts={opentypeFonts}
        fontLoadOutcomes={fontLoadOutcomes}
        imageLoadOutcomes={new Map()}
      />,
    )

    // Initial render: image not yet resolved either way (ordinary loading
    // window) — falls back to the grey dashed placeholder, drawn on a
    // <canvas>, not the render-error marker. No error yet — correct.
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(container.querySelector('title')).toBeNull()

    // The image loader settles: the core registry now knows this URL is
    // confirmed missing (this is exactly what load-asset-images.ts's
    // unavailableAttempt() does internally).
    markImageUnavailable(URL, `${URL} is not uploaded.`)

    // React-visible signal of that settlement. Every other prop is the SAME
    // reference as the first render — only imageLoadOutcomes (a fresh Map)
    // changed.
    rerender(
      <CanvasElementSlot
        element={element}
        index={0}
        renderContext={ctx}
        assetImages={assetImages}
        fontFamilies={fontFamilies}
        opentypeFonts={opentypeFonts}
        fontLoadOutcomes={fontLoadOutcomes}
        imageLoadOutcomes={
          new Map([[URL, { key: URL, status: 'missing', message: 'x' } as ImageLoadOutcome]])
        }
      />,
    )

    const title = container.querySelector('title')
    expect(title?.textContent).toMatch(/Render error/)
  })
})
