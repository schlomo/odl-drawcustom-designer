import type { DitherMode, TagColorMode } from '../../core'
import type opentype from 'opentype.js'
import { memo, useEffect, useRef } from 'react'
import type { CanvasPrimitive } from '../../core'
import { drawCanvasStub } from '../lib/draw-canvas-stubs'

interface CanvasElementLayerProps {
  primitive: CanvasPrimitive
  width: number
  height: number
  colorMode: TagColorMode
  ditherMode?: DitherMode
  assetImages: ReadonlyMap<string, HTMLImageElement>
  fontFamilies: ReadonlyMap<string, string>
  opentypeFonts: ReadonlyMap<string, opentype.Font>
}

/** One full-size transparent canvas layer for a single payload element (z-order via DOM). */
export const CanvasElementLayer = memo(function CanvasElementLayer({
  primitive,
  width,
  height,
  colorMode,
  ditherMode,
  assetImages,
  fontFamilies,
  opentypeFonts,
}: CanvasElementLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, width, height)
    drawCanvasStub(ctx, primitive, assetImages, fontFamilies, opentypeFonts, {
      colorMode,
      ditherMode,
    })
  }, [colorMode, assetImages, ditherMode, fontFamilies, height, opentypeFonts, primitive, width])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
})
