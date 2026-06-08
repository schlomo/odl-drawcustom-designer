import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { renderElement, type DrawElement, type RenderContext } from '../../core'
import type { RenderResult } from '../../core/renderer/types'
import { CanvasElementLayer } from './CanvasElementLayer'
import {
  applyBoundsResize,
  applyLineEndpoint,
  applyRadiusResize,
  isElementDraggable,
  resizeBoundsWithHandle,
  supportsBoxResize,
  supportsLineEndpointResize,
  supportsRadiusResize,
  translateElement,
  type ResizeHandle,
} from '../lib/element-geometry'
import {
  areAssetImageMapsEqual,
  collectDlimgAssetKeysFromElements,
  loadAssetImageMap,
  pruneAssetImagesForKeys,
} from '../lib/load-asset-images'
import {
  areFontFamilyMapsEqual,
  collectFontKeysFromElements,
  loadFontFamilyMap,
} from '../lib/load-font-faces'
import { areFontLoadOutcomeMapsEqual, type FontLoadOutcome } from '../lib/font-load-outcome'
import { getFontStatusMessages } from '../lib/font-readiness'
import {
  areOpentypeFontMapsEqual,
  loadOpentypeFontMapWithOutcomes,
} from '../lib/load-opentype-fonts'
import { StatusBanner } from './StatusBanner'
import { findTopmostElementHit } from '../lib/canvas-hit-test'
import { getPrimitiveBounds, type ElementBounds } from '../lib/primitive-bounds'
import { snapMoveDelta, snapToGrid } from '../lib/snap-to-grid'
import type { SnapGridPrefs } from '../preferences/snapGrid'
import type { CanvasRotation } from '../hooks/useProjectState'
import { shell } from '../styles/shell'
import { SvgPrimitive } from './SvgPrimitive'

interface DesignerCanvasProps {
  elements: DrawElement[]
  editElements: DrawElement[]
  renderContext: RenderContext
  rotation: CanvasRotation
  selectedIndex: number | null
  assetRevision: number
  snapGrid: SnapGridPrefs
  onSelectElement: (index: number | null) => void
  onUpdateElement: (index: number, element: DrawElement) => void
  onDeleteSelected: () => void
  onNudgeSelected: (dx: number, dy: number) => void
  onClearAll: () => void
  onToggleSnap: () => void
}

interface RenderedElement {
  index: number
  result: RenderResult
}

interface DragSession {
  kind: 'move' | 'resize'
  index: number
  pointerId: number
  startCanvas: { x: number; y: number }
  startElement: DrawElement
  startBounds: ElementBounds
  handle?: ResizeHandle
}

const HANDLE_SIZE = 8
const BOX_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function paperTransform(rotation: CanvasRotation, scale: number): string {
  return `rotate(${rotation}deg) scale(${scale})`
}

function handlePosition(
  bounds: ElementBounds,
  handle: ResizeHandle,
  lineCoords?: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } {
  if (lineCoords) {
    if (handle === 'line-start') {
      return { x: lineCoords.x1, y: lineCoords.y1 }
    }
    if (handle === 'line-end') {
      return { x: lineCoords.x2, y: lineCoords.y2 }
    }
  }

  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height

  switch (handle) {
    case 'nw':
      return { x: bounds.x, y: bounds.y }
    case 'n':
      return { x: cx, y: bounds.y }
    case 'ne':
      return { x: right, y: bounds.y }
    case 'e':
      return { x: right, y: cy }
    case 'se':
      return { x: right, y: bottom }
    case 's':
      return { x: cx, y: bottom }
    case 'sw':
      return { x: bounds.x, y: bottom }
    case 'w':
      return { x: bounds.x, y: cy }
    case 'line-start':
      return { x: bounds.x, y: bounds.y }
    case 'line-end':
      return { x: right, y: bottom }
    default:
      return { x: cx, y: cy }
  }
}

function hitHandle(
  point: { x: number; y: number },
  bounds: ElementBounds,
  handles: ResizeHandle[],
  lineCoords?: { x1: number; y1: number; x2: number; y2: number },
): ResizeHandle | null {
  for (const handle of handles) {
    const pos = handlePosition(bounds, handle, lineCoords)
    const half = HANDLE_SIZE
    if (
      point.x >= pos.x - half &&
      point.x <= pos.x + half &&
      point.y >= pos.y - half &&
      point.y <= pos.y + half
    ) {
      return handle
    }
  }
  return null
}

function getResizeHandles(element: DrawElement): ResizeHandle[] {
  if (supportsLineEndpointResize(element)) {
    return ['line-start', 'line-end']
  }
  if (supportsRadiusResize(element)) {
    return ['e']
  }
  if (supportsBoxResize(element)) {
    return BOX_HANDLES
  }
  return []
}

function applySnap(point: { x: number; y: number }, snapGrid: SnapGridPrefs): { x: number; y: number } {
  return {
    x: snapToGrid(point.x, snapGrid.size, snapGrid.enabled),
    y: snapToGrid(point.y, snapGrid.size, snapGrid.enabled),
  }
}

export function DesignerCanvas({
  elements,
  editElements,
  renderContext,
  rotation,
  selectedIndex,
  assetRevision,
  snapGrid,
  onSelectElement,
  onUpdateElement,
  onDeleteSelected,
  onNudgeSelected,
  onClearAll,
  onToggleSnap,
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const didDragRef = useRef(false)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [assetImages, setAssetImages] = useState<Map<string, HTMLImageElement>>(() => new Map())
  const [fontFamilies, setFontFamilies] = useState<Map<string, string>>(() => new Map())
  const [opentypeFonts, setOpentypeFonts] = useState<Map<string, import('opentype.js').Font>>(
    () => new Map(),
  )
  const [fontLoadOutcomes, setFontLoadOutcomes] = useState<Map<string, FontLoadOutcome>>(
    () => new Map(),
  )
  const [dragSession, setDragSession] = useState<DragSession | null>(null)

  useEffect(() => {
    dragSessionRef.current = dragSession
  }, [dragSession])

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
    void opentypeFonts
    return elements.flatMap((element, index) => {
      const result = renderElement(element, renderContext)
      return result ? [{ index, result }] : []
    })
  }, [elements, opentypeFonts, renderContext])

  const hitTargets = useMemo(
    () =>
      renderedElements.map((entry) => ({
        index: entry.index,
        bounds: getPrimitiveBounds(entry.result.primitive),
      })),
    [renderedElements],
  )

  const dlimgAssetKeys = useMemo(
    () => collectDlimgAssetKeysFromElements(elements),
    [elements],
  )

  const fontAssetKeys = useMemo(() => collectFontKeysFromElements(elements), [elements])

  const fontsLoading = useMemo(() => {
    if (fontAssetKeys.length === 0) {
      return false
    }

    return fontAssetKeys.some((key) => {
      const outcome = fontLoadOutcomes.get(key)
      return (
        outcome == null ||
        (outcome.status !== 'ready' &&
          outcome.status !== 'missing' &&
          outcome.status !== 'failed')
      )
    })
  }, [fontAssetKeys, fontLoadOutcomes])

  const fontStatusMessages = useMemo(
    () => getFontStatusMessages(elements, fontLoadOutcomes, fontsLoading),
    [elements, fontLoadOutcomes, fontsLoading],
  )

  useEffect(() => {
    let cancelled = false

    void loadAssetImageMap(dlimgAssetKeys).then((images) => {
      if (!cancelled) {
        setAssetImages((current) => (areAssetImageMapsEqual(current, images) ? current : images))
      }
    })

    return () => {
      cancelled = true
    }
  }, [assetRevision, dlimgAssetKeys])

  useEffect(() => {
    let cancelled = false

    const loadPromise =
      fontAssetKeys.length === 0
        ? Promise.resolve({
            families: new Map<string, string>(),
            batch: { fonts: new Map(), outcomes: new Map<string, FontLoadOutcome>() },
          })
        : Promise.all([
            loadFontFamilyMap(fontAssetKeys),
            loadOpentypeFontMapWithOutcomes(fontAssetKeys),
          ]).then(([families, batch]) => ({ families, batch }))

    void loadPromise.then((result) => {
      if (!cancelled) {
        setFontFamilies((current) =>
          areFontFamilyMapsEqual(current, result.families) ? current : result.families,
        )
        setOpentypeFonts((current) =>
          areOpentypeFontMapsEqual(current, result.batch.fonts) ? current : result.batch.fonts,
        )
        setFontLoadOutcomes((current) =>
          areFontLoadOutcomeMapsEqual(current, result.batch.outcomes)
            ? current
            : result.batch.outcomes,
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [assetRevision, fontAssetKeys])

  const displayAssetImages = useMemo(() => {
    void assetRevision
    return pruneAssetImagesForKeys(assetImages, dlimgAssetKeys)
  }, [assetImages, assetRevision, dlimgAssetKeys])

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

  const selectedRendered =
    selectedIndex != null
      ? renderedElements.find((item) => item.index === selectedIndex)?.result
      : null

  const lineCoords = useMemo(() => {
    if (selectedRendered?.layer !== 'svg' || selectedRendered.primitive.kind !== 'line') {
      return undefined
    }
    return {
      x1: selectedRendered.primitive.x1,
      y1: selectedRendered.primitive.y1,
      x2: selectedRendered.primitive.x2,
      y2: selectedRendered.primitive.y2,
    }
  }, [selectedRendered])

  const selectedEditElement =
    selectedIndex != null ? (editElements[selectedIndex] ?? null) : null

  const mapClientToCanvas = useCallback(
    (clientX: number, clientY: number, allowOutside = false): { x: number; y: number } | null => {
      const paper = containerRef.current?.querySelector<HTMLElement>('[data-canvas-paper]')
      if (!paper) {
        return null
      }
      const rect = paper.getBoundingClientRect()
      const scaleX = rect.width / renderContext.width
      const scaleY = rect.height / renderContext.height
      const localX = (clientX - rect.left) / scaleX
      const localY = (clientY - rect.top) / scaleY
      if (
        !allowOutside &&
        (localX < 0 || localY < 0 || localX > renderContext.width || localY > renderContext.height)
      ) {
        return null
      }
      return { x: localX, y: localY }
    },
    [renderContext.height, renderContext.width],
  )

  const finishDrag = useCallback(() => {
    dragSessionRef.current = null
    setDragSession(null)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragging = dragSessionRef.current != null
      const point = mapClientToCanvas(event.clientX, event.clientY, dragging)
      setPointer(
        dragging || point == null
          ? point
          : point.x >= 0 &&
              point.y >= 0 &&
              point.x <= renderContext.width &&
              point.y <= renderContext.height
            ? point
            : null,
      )

      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId || !point) {
        return
      }

      didDragRef.current = true
      event.preventDefault()

      const snapped = applySnap(point, snapGrid)

      if (session.kind === 'move') {
        const rawDx = point.x - session.startCanvas.x
        const rawDy = point.y - session.startCanvas.y
        const { dx, dy } = snapMoveDelta(
          session.startBounds,
          rawDx,
          rawDy,
          snapGrid.size,
          snapGrid.enabled,
        )
        if (dx !== 0 || dy !== 0) {
          onUpdateElement(
            session.index,
            translateElement(session.startElement, dx, dy, {
              width: renderContext.width,
              height: renderContext.height,
            }),
          )
        }
        return
      }

      const element = session.startElement
      const handle = session.handle
      if (!handle) {
        return
      }

      if (supportsLineEndpointResize(element) && (handle === 'line-start' || handle === 'line-end')) {
        const endpoint = handle === 'line-start' ? 'start' : 'end'
        onUpdateElement(
          session.index,
          applyLineEndpoint(element, endpoint, snapped.x, snapped.y),
        )
        return
      }

      if (supportsRadiusResize(element) && handle === 'e') {
        const cx = element.x as number
        const cy = element.y as number
        const radius = Math.hypot(snapped.x - cx, snapped.y - cy)
        onUpdateElement(session.index, applyRadiusResize(element, radius))
        return
      }

      if (supportsBoxResize(element)) {
        const nextBounds = resizeBoundsWithHandle(session.startBounds, handle, snapped.x, snapped.y)
        onUpdateElement(session.index, applyBoundsResize(element, nextBounds))
      }
    },
    [mapClientToCanvas, onUpdateElement, renderContext.height, renderContext.width, snapGrid],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current
      if (session && event.pointerId === session.pointerId) {
        finishDrag()
      }
    },
    [finishDrag],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const point = mapClientToCanvas(event.clientX, event.clientY)
      if (!point) {
        return
      }

      didDragRef.current = false

      const topHit = findTopmostElementHit(hitTargets, point)

      if (
        selectedIndex != null &&
        selectionBounds &&
        selectedEditElement &&
        topHit?.index === selectedIndex
      ) {
        const handles = getResizeHandles(selectedEditElement)
        const handle = hitHandle(point, selectionBounds, handles, lineCoords)
        if (handle && isElementDraggable(selectedEditElement)) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const session: DragSession = {
            kind: 'resize',
            index: selectedIndex,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: selectedEditElement,
            startBounds: selectionBounds,
            handle,
          }
          dragSessionRef.current = session
          setDragSession(session)
          return
        }

        if (isElementDraggable(selectedEditElement)) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const session: DragSession = {
            kind: 'move',
            index: selectedIndex,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: selectedEditElement,
            startBounds: selectionBounds,
          }
          dragSessionRef.current = session
          setDragSession(session)
          return
        }
      }

      if (topHit) {
        onSelectElement(topHit.index)
        const editElement = editElements[topHit.index]
        if (editElement && isElementDraggable(editElement)) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const session: DragSession = {
            kind: 'move',
            index: topHit.index,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: editElement,
            startBounds: topHit.bounds,
          }
          dragSessionRef.current = session
          setDragSession(session)
        }
        return
      }

      onSelectElement(null)
    },
    [
      editElements,
      hitTargets,
      mapClientToCanvas,
      onSelectElement,
      selectedEditElement,
      selectedIndex,
      selectionBounds,
      lineCoords,
    ],
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (didDragRef.current) {
        didDragRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
    [],
  )

  const handlePointerLeave = useCallback(() => {
    if (!dragSessionRef.current) {
      setPointer(null)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedIndex == null) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const step = event.shiftKey ? 10 : snapGrid.enabled ? snapGrid.size : 1

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          event.preventDefault()
          onDeleteSelected()
          break
        case 'ArrowLeft':
          event.preventDefault()
          onNudgeSelected(-step, 0)
          break
        case 'ArrowRight':
          event.preventDefault()
          onNudgeSelected(step, 0)
          break
        case 'ArrowUp':
          event.preventDefault()
          onNudgeSelected(0, -step)
          break
        case 'ArrowDown':
          event.preventDefault()
          onNudgeSelected(0, step)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDeleteSelected, onNudgeSelected, selectedIndex, snapGrid.enabled, snapGrid.size])

  const resizeHandles =
    selectedEditElement && selectionBounds ? getResizeHandles(selectedEditElement) : []

  const gridLines = useMemo(() => {
    if (!snapGrid.enabled) {
      return null
    }
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
    for (let x = 0; x <= renderContext.width; x += snapGrid.size) {
      lines.push({ x1: x, y1: 0, x2: x, y2: renderContext.height, key: `v-${x}` })
    }
    for (let y = 0; y <= renderContext.height; y += snapGrid.size) {
      lines.push({ x1: 0, y1: y, x2: renderContext.width, y2: y, key: `h-${y}` })
    }
    return lines
  }, [renderContext.height, renderContext.width, snapGrid.enabled, snapGrid.size])

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col rounded-lg border ${shell.panelBorder} ${shell.panel} shadow-lg`}
      aria-label="E-paper canvas"
    >
      <div className={`flex items-center justify-between border-b ${shell.panelBorder} px-4 py-2`}>
        <h2 className={shell.heading}>Canvas</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${shell.button} ${snapGrid.enabled ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]' : ''}`}
            onClick={onToggleSnap}
          >
            Snap {snapGrid.enabled ? 'On' : 'Off'}
          </button>
          <button type="button" className={shell.button} onClick={onClearAll}>
            Clear all
          </button>
          <span className={`font-mono text-xs ${shell.muted}`}>
            {pointer
              ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}`
              : `${renderContext.width}×${renderContext.height}`}
          </span>
        </div>
      </div>
      {fontStatusMessages.map((message, index) => (
        <StatusBanner key={`${message.severity}-${message.title}-${index}`} message={message} />
      ))}
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--shell-hover)] p-6"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
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
          {gridLines ? (
            <svg
              viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
              className="pointer-events-none absolute inset-0 z-0 h-full w-full"
              aria-hidden
            >
              {gridLines.map((line) => (
                <line
                  key={line.key}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                />
              ))}
            </svg>
          ) : null}
          {renderedElements.map((entry) => (
            <div
              key={entry.index}
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: entry.index + 1 }}
            >
              {entry.result.layer === 'svg' ? (
                <svg
                  viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
                  className="h-full w-full"
                  aria-hidden
                >
                  <SvgPrimitive primitive={entry.result.primitive} fontFamilies={fontFamilies} />
                </svg>
              ) : (
                <CanvasElementLayer
                  primitive={entry.result.primitive}
                  width={renderContext.width}
                  height={renderContext.height}
                  assetImages={displayAssetImages}
                  fontFamilies={fontFamilies}
                  opentypeFonts={opentypeFonts}
                />
              )}
            </div>
          ))}
          <svg
            viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: renderedElements.length + 1 }}
            aria-hidden
          >
            {selectionBounds ? (
              <>
                <rect
                  x={selectionBounds.x - 2}
                  y={selectionBounds.y - 2}
                  width={selectionBounds.width + 4}
                  height={selectionBounds.height + 4}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
                {resizeHandles.map((handle) => {
                  const pos = handlePosition(selectionBounds, handle, lineCoords)
                  return (
                    <rect
                      key={handle}
                      x={pos.x - HANDLE_SIZE / 2}
                      y={pos.y - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  )
                })}
              </>
            ) : null}
          </svg>
        </div>
      </div>
    </section>
  )
}
