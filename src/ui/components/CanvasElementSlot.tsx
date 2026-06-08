import { memo, useMemo } from 'react'
import type opentype from 'opentype.js'
import { renderElement, type DrawElement, type RenderContext } from '../../core'
import { collectFontKeysFromElements } from '../lib/load-font-faces'
import { fontLayoutTokenForKeys } from '../lib/font-layout-token'
import { CanvasElementLayer } from './CanvasElementLayer'
import { SvgPrimitive } from './SvgPrimitive'

interface CanvasElementSlotProps {
  element: DrawElement
  index: number
  renderContext: RenderContext
  assetImages: ReadonlyMap<string, HTMLImageElement>
  fontFamilies: ReadonlyMap<string, string>
  opentypeFonts: ReadonlyMap<string, opentype.Font>
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
  hidden = false,
  layerZIndex,
}: CanvasElementSlotProps) {
  const result = useMemo(() => {
    // renderElement reads font metrics via getFont(); token ties layout to loaded fonts.
    void fontLayoutTokenForKeys(collectFontKeysFromElements([element]), opentypeFonts)
    return renderElement(element, renderContext)
  }, [element, renderContext, opentypeFonts])

  if (!result) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: layerZIndex ?? index + 1, visibility: hidden ? 'hidden' : 'visible' }}
    >
      {result.layer === 'svg' ? (
        <svg
          viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
          className="h-full w-full"
          aria-hidden
        >
          <SvgPrimitive primitive={result.primitive} fontFamilies={fontFamilies} />
        </svg>
      ) : (
        <CanvasElementLayer
          primitive={result.primitive}
          width={renderContext.width}
          height={renderContext.height}
          accentMode={renderContext.accentMode}
          ditherMode={renderContext.ditherMode}
          assetImages={assetImages}
          fontFamilies={fontFamilies}
          opentypeFonts={opentypeFonts}
        />
      )}
    </div>
  )
})
