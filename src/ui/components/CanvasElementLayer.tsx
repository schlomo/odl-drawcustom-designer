import { useEffect, useRef } from 'react'
import type { CanvasPrimitive } from '../../core/renderer/types'
import { drawCanvasStub } from '../lib/draw-canvas-stubs'

interface CanvasElementLayerProps {
  primitive: CanvasPrimitive
  width: number
  height: number
  assetImages: ReadonlyMap<string, HTMLImageElement>
  fontFamilies: ReadonlyMap<string, string>
}

/** One full-size transparent canvas layer for a single payload element (z-order via DOM). */
export function CanvasElementLayer({
  primitive,
  width,
  height,
  assetImages,
  fontFamilies,
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
    drawCanvasStub(ctx, primitive, assetImages, fontFamilies)
  }, [assetImages, fontFamilies, height, primitive, width])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}
