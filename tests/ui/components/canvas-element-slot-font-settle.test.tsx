/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearFontRegistry, markFontUnavailable, type DrawElement, type RenderContext } from '../../../src/core'
import { CanvasElementSlot } from '../../../src/ui/components/CanvasElementSlot'
import type { FontLoadOutcome } from '../../../src/ui/lib/font-load-outcome'

/**
 * Maintainer manual-test finding on PR #54: set an element's font to a
 * nonexistent key in YAML — the status banner updates immediately (it reads
 * `fontLoadOutcomes`), but the canvas keeps showing the OLD wrong-metrics
 * text-stub render until some unrelated change (adding another element,
 * editing a coordinate) happens to touch `elements` again. The element
 * render path (`CanvasElementSlot`) memoizes on `[element, renderContext,
 * opentypeFonts]` — none of which change when a font outcome settles to
 * "missing" (the core registry's `unavailable` mark is a module-level,
 * non-React-visible side effect; `opentypeFonts` only changes when a font
 * successfully *loads*, and stays referentially equal otherwise).
 *
 * The fix must make settling a missing/failed outcome alone (no `elements`
 * change) enough to swap the stale text-stub for the render-error marker.
 */
describe('CanvasElementSlot re-renders when a font outcome settles, without an elements change', () => {
  const ctx: RenderContext = { width: 200, height: 100, colorMode: 'bw' }
  const FONT_KEY = 'issue53-stale-canvas.ttf'

  afterEach(() => {
    clearFontRegistry()
  })

  it('swaps the stale text-stub for the render-error marker the moment the outcome settles to missing', () => {
    // Stable references reused across both renders below — the whole point
    // of this test is that NEITHER `element` NOR `opentypeFonts` changes,
    // only `fontLoadOutcomes` does (a fresh Map, just like DesignerCanvas's
    // setFontLoadOutcomes produces after loadOpentypeFontMapWithOutcomes
    // resolves).
    const element: DrawElement = { type: 'text', value: 'Hello', x: 10, y: 10, font: FONT_KEY }
    const opentypeFonts = new Map()

    const { container, rerender } = render(
      <CanvasElementSlot
        element={element}
        index={0}
        renderContext={ctx}
        assetImages={new Map()}
        fontFamilies={new Map()}
        opentypeFonts={opentypeFonts}
        fontLoadOutcomes={new Map()}
        imageLoadOutcomes={new Map()}
      />,
    )

    // Initial render: font not yet resolved either way (ordinary loading
    // window) — falls back to the estimated-metrics text-stub, drawn on a
    // <canvas>, not the render-error marker. No error yet — correct.
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(container.querySelector('title')).toBeNull()

    // The font loader settles: the core registry now knows this key is
    // confirmed missing (this is exactly what load-opentype-fonts.ts's
    // unavailableOutcome() does internally).
    markFontUnavailable(FONT_KEY, `${FONT_KEY} is not uploaded.`)

    // React-visible signal of that settlement. `element` and `opentypeFonts`
    // are the SAME references as the first render — only fontLoadOutcomes
    // (a fresh Map) changed.
    rerender(
      <CanvasElementSlot
        element={element}
        index={0}
        renderContext={ctx}
        assetImages={new Map()}
        fontFamilies={new Map()}
        opentypeFonts={opentypeFonts}
        fontLoadOutcomes={
          new Map([[FONT_KEY, { key: FONT_KEY, status: 'missing', message: 'x' } as FontLoadOutcome]])
        }
        imageLoadOutcomes={new Map()}
      />,
    )

    const title = container.querySelector('title')
    expect(title?.textContent).toMatch(/Render error/)
  })
})
