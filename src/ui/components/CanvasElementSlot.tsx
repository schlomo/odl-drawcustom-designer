import { memo, useMemo } from 'react'
import type opentype from 'opentype.js'
import { safeRenderElement, renderHalftonePatternDefs, type DrawElement, type RenderContext } from '../../core'
import { collectFontKeysFromElements } from '../lib/load-font-faces'
import type { FontLoadOutcome } from '../lib/font-load-outcome'
import { fontLayoutTokenForKeys } from '../lib/font-layout-token'
import { resolveHiddenElementHint } from '../lib/hidden-element-hints'
import { CanvasElementLayer } from './CanvasElementLayer'
import { HiddenElementHintOverlay } from './HiddenElementHintOverlay'
import { SvgPrimitive } from './SvgPrimitive'

interface CanvasElementSlotProps {
  element: DrawElement
  index: number
  renderContext: RenderContext
  assetImages: ReadonlyMap<string, HTMLImageElement>
  fontFamilies: ReadonlyMap<string, string>
  opentypeFonts: ReadonlyMap<string, opentype.Font>
  /**
   * Settlement signal for the core font registry's `unavailable` mark
   * (issue #53 follow-up): that mark is module-level state outside React,
   * with no render-time read here — `safeRenderElement` only picks it up
   * because it happens to throw when a font is confirmed missing. Without
   * this prop in the memo's dependencies, a font settling to missing/failed
   * (no `element`/`opentypeFonts` change) left the OLD wrong-metrics
   * text-stub on screen indefinitely, until some unrelated edit touched
   * `element` again. Not read directly in the body below — its identity
   * changing is the signal.
   */
  fontLoadOutcomes: ReadonlyMap<string, FontLoadOutcome>
  /** Hide the base layer while a drag overlay shows the same element. */
  hidden?: boolean
  /** Override z-index (drag overlay sits above the static stack). */
  layerZIndex?: number
}

/** Memoized single canvas layer — only re-renders when its element reference changes. */
export const CanvasElementSlot = memo(function CanvasElementSlot({
  element,
  index,
  renderContext,
  assetImages,
  fontFamilies,
  opentypeFonts,
  fontLoadOutcomes,
  hidden = false,
  layerZIndex,
}: CanvasElementSlotProps) {
  const result = useMemo(() => {
    // renderElement reads font metrics via getFont(); token ties layout to loaded fonts.
    void fontLayoutTokenForKeys(collectFontKeysFromElements([element]), opentypeFonts)
    return safeRenderElement(element, renderContext)
    // fontLoadOutcomes is a settlement signal only (see the prop doc above),
    // not read here — it must stay a dependency anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, renderContext, opentypeFonts, fontLoadOutcomes])

  const hiddenHint = useMemo(
    () => resolveHiddenElementHint(element, result, renderContext),
    [element, result, renderContext],
  )
  const halftonePatternDefs = useMemo(
    () =>
      renderHalftonePatternDefs({
        colorMode: renderContext.colorMode,
        ditherMode: renderContext.ditherMode,
      }),
    [renderContext.colorMode, renderContext.ditherMode],
  )

  if (!result && !hiddenHint) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: layerZIndex ?? index + 1, visibility: hidden ? 'hidden' : 'visible' }}
    >
      {result?.layer === 'svg' ? (
        <svg
          viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
          className="h-full w-full"
          aria-hidden
        >
          {halftonePatternDefs ? (
            <defs dangerouslySetInnerHTML={{ __html: halftonePatternDefs }} />
          ) : null}
          <SvgPrimitive primitive={result.primitive} fontFamilies={fontFamilies} />
        </svg>
      ) : result ? (
        <CanvasElementLayer
          primitive={result.primitive}
          width={renderContext.width}
          height={renderContext.height}
          colorMode={renderContext.colorMode}
          ditherMode={renderContext.ditherMode}
          assetImages={assetImages}
          fontFamilies={fontFamilies}
          opentypeFonts={opentypeFonts}
        />
      ) : null}
      {hiddenHint ? (
        <HiddenElementHintOverlay
          hint={hiddenHint}
          width={renderContext.width}
          height={renderContext.height}
        />
      ) : null}
    </div>
  )
})
