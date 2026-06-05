import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { renderElement, type DrawElement, type RenderContext } from '../../core'
import type { RenderResult } from '../../core/renderer/types'
import { drawCanvasStub } from '../lib/draw-canvas-stubs'
import { getPrimitiveBounds, pointInBounds } from '../lib/primitive-bounds'
import type { CanvasRotation } from '../hooks/useProjectState'
import { shell } from '../styles/shell'
import { SvgPrimitive } from './SvgPrimitive'

interface DesignerCanvasProps {
  elements: DrawElement[]
  renderContext: RenderContext
  rotation: CanvasRotation
  selectedIndex: number | null
  onSelectElement: (index: number | null) => void
}

interface RenderedElement {
  index: number
  result: RenderResult
}

function paperTransform(rotation: CanvasRotation, scale: number): string {
  // Use rotate(0deg) — not `none` — so scale() can be combined (none invalidates the whole transform).
  return `rotate(${rotation}deg) scale(${scale})`
}

export function DesignerCanvas({
  elements,
  renderContext,
  rotation,
  selectedIndex,
  onSelectElement,
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [fitScale, setFitScale] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const updateScale = () => {
      const { width: cw, height: ch } = container.getBoundingClientRect()
      const scale = Math.min(cw / renderContext.width, ch / renderContext.height, 1)
      setFitScale(scale > 0 ? scale : 1)
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [renderContext.height, renderContext.width])

  const renderedElements = useMemo<RenderedElement[]>(() => {
    return elements.flatMap((element, index) => {
      const result = renderElement(element, renderContext)
      return result ? [{ index, result }] : []
    })
  }, [elements, renderContext])

  const svgPrimitives = renderedElements.filter((entry) => entry.result.layer === 'svg')
  const canvasPrimitives = renderedElements.filter((entry) => entry.result.layer === 'canvas')

  const selectionBounds = useMemo(() => {
    if (selectedIndex == null) {
      return null
    }
    const entry = renderedElements.find((item) => item.index === selectedIndex)
    if (!entry) {
      return null
    }
    return getPrimitiveBounds(entry.result.primitive)
  }, [renderedElements, selectedIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, renderContext.width, renderContext.height)
    for (const entry of canvasPrimitives) {
      if (entry.result.layer === 'canvas') {
        drawCanvasStub(ctx, entry.result.primitive)
      }
    }
  }, [canvasPrimitives, renderContext.height, renderContext.width])

  const mapClientToCanvas = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const paper = containerRef.current?.querySelector<HTMLElement>('[data-canvas-paper]')
      if (!paper) {
        return null
      }
      const rect = paper.getBoundingClientRect()
      const scaleX = rect.width / renderContext.width
      const scaleY = rect.height / renderContext.height
      const localX = (clientX - rect.left) / scaleX
      const localY = (clientY - rect.top) / scaleY
      if (localX < 0 || localY < 0 || localX > renderContext.width || localY > renderContext.height) {
        return null
      }
      return { x: localX, y: localY }
    },
    [renderContext.height, renderContext.width],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const point = mapClientToCanvas(event.clientX, event.clientY)
      setPointer(point)
    },
    [mapClientToCanvas],
  )

  const handlePointerLeave = useCallback(() => {
    setPointer(null)
  }, [])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const point = mapClientToCanvas(event.clientX, event.clientY)
      if (!point) {
        onSelectElement(null)
        return
      }
      for (let i = renderedElements.length - 1; i >= 0; i--) {
        const entry = renderedElements[i]
        const bounds = getPrimitiveBounds(entry.result.primitive)
        if (pointInBounds(point.x, point.y, bounds)) {
          onSelectElement(entry.index)
          return
        }
      }
      onSelectElement(null)
    },
    [mapClientToCanvas, onSelectElement, renderedElements],
  )

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col rounded-lg border ${shell.panelBorder} ${shell.panel} shadow-lg`}
      aria-label="E-paper canvas"
    >
      <div className={`flex items-center justify-between border-b ${shell.panelBorder} px-4 py-2`}>
        <h2 className={shell.heading}>Canvas</h2>
        <span className={`font-mono text-xs ${shell.muted}`}>
          {pointer
            ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}`
            : `${renderContext.width}×${renderContext.height}`}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--shell-hover)] p-6"
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div
          data-canvas-paper
          className="relative bg-white shadow-md"
          style={
            {
              width: renderContext.width,
              height: renderContext.height,
              transform: paperTransform(rotation, fitScale),
              transformOrigin: 'center center',
            } satisfies CSSProperties
          }
        >
          <svg
            viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="SVG render layer"
          >
            {svgPrimitives.map((entry) =>
              entry.result.layer === 'svg' ? (
                <g key={entry.index}>
                  <SvgPrimitive primitive={entry.result.primitive} />
                </g>
              ) : null,
            )}
            {selectionBounds ? (
              <rect
                x={selectionBounds.x - 2}
                y={selectionBounds.y - 2}
                width={selectionBounds.width + 4}
                height={selectionBounds.height + 4}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6 3"
                pointerEvents="none"
              />
            ) : null}
          </svg>
          <canvas
            ref={canvasRef}
            width={renderContext.width}
            height={renderContext.height}
            className="absolute inset-0 h-full w-full"
            aria-label="Canvas stub layer"
          />
        </div>
      </div>
    </section>
  )
}
