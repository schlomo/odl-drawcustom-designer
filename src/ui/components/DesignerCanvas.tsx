import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { renderElement, type DrawElement, type RenderContext } from '../../core'
import { CanvasElementSlot } from './CanvasElementSlot'
import {
  applyBoundsResize,
  applyLineEndpoint,
  applySeSizeResize,
  getCanvasResizeHandles,
  getInteractiveResizeHandles,
  isElementDraggable,
  resizeBoundsWithHandle,
  supportsBoxResize,
  supportsLineEndpointResize,
  supportsSeSizeResize,
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
import { fontLayoutTokenForKeys } from '../lib/font-layout-token'
import { getFontStatusMessages } from '../lib/font-readiness'
import { sortStatusMessages, type StatusMessage } from '../lib/status-messages'
import {
  areOpentypeFontMapsEqual,
  loadOpentypeFontMapWithOutcomes,
} from '../lib/load-opentype-fonts'
import { StatusBanner } from './StatusBanner'
import { findTopmostElementHit } from '../lib/canvas-hit-test'
import {
  HANDLE_VISUAL_SIZE,
  handlePosition,
  hitResizeHandle,
  resizeHandleCursor,
  shouldPreferMoveOverResize,
} from '../lib/canvas-resize-handles'
import { shouldHandleCanvasKeyboard } from '../lib/canvas-keyboard'
import { type ElementBounds } from '../lib/primitive-bounds'
import { resolveElementHitBounds } from '../lib/hidden-element-hints'
import { snapMoveDelta, snapToGrid } from '../lib/snap-to-grid'
import type { SnapGridPrefs } from '../preferences/snapGrid'
import type { CanvasRotation } from '../hooks/useProjectState'
import { FeatureToggle } from './FeatureToggle'
import { shell } from '../styles/shell'

interface DesignerCanvasProps {
  elements: DrawElement[]
  editElements: DrawElement[]
  renderContext: RenderContext
  rotation: CanvasRotation
  selectedIndex: number | null
  assetRevision: number
  snapGrid: SnapGridPrefs
  showHiddenHints: boolean
  onToggleShowHiddenHints: () => void
  extraStatusMessages?: readonly StatusMessage[]
  onSelectElement: (index: number | null) => void
  onUpdateElement: (index: number, element: DrawElement) => void
  onDeleteSelected: () => void
  onNudgeSelected: (dx: number, dy: number) => void
  onClearAll: () => void
  onToggleSnap: () => void
  previewDitherMode: 0 | 2
  onTogglePreviewDither: () => void
  onDragActiveChange?: (active: boolean) => void
}

interface DragOverlay {
  index: number
  element: DrawElement
}

interface DragSession {
  kind: 'move' | 'resize'
  index: number
  pointerId: number
  startCanvas: { x: number; y: number }
  /** Raw edit payload — committed on pointer up. */
  startElement: DrawElement
  /** Resolved preview payload — shown in the drag overlay only. */
  startDisplayElement: DrawElement
  startBounds: ElementBounds
  handle?: ResizeHandle
}

const HANDLE_SIZE = HANDLE_VISUAL_SIZE
const HANDLE_FILL_INTERACTIVE = '#3b82f6'
const HANDLE_FILL_DISABLED = '#ef4444'

function paperTransform(rotation: CanvasRotation, scale: number): string {
  return `rotate(${rotation}deg) scale(${scale})`
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
  showHiddenHints,
  onToggleShowHiddenHints,
  extraStatusMessages = [],
  onSelectElement,
  onUpdateElement,
  onDeleteSelected,
  onNudgeSelected,
  onClearAll,
  onToggleSnap,
  previewDitherMode,
  onTogglePreviewDither,
  onDragActiveChange,
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null)
  const didDragRef = useRef(false)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string>('default')
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
  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null)
  /** Preview stack frozen at drag start so live YAML/property updates do not re-render every layer. */
  const [frozenElements, setFrozenElements] = useState<DrawElement[] | null>(null)

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

  const fontAssetKeys = useMemo(() => collectFontKeysFromElements(elements), [elements])

  const hitTargets = useMemo(() => {
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return elements.flatMap((element, index) => {
      const bounds = resolveElementHitBounds(element, renderContext)
      return bounds ? [{ index, bounds }] : []
    })
  }, [elements, fontAssetKeys, renderContext, opentypeFonts])

  const dlimgAssetKeys = useMemo(
    () => collectDlimgAssetKeysFromElements(elements),
    [elements],
  )

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

  const statusMessages = useMemo(
    () => sortStatusMessages([...extraStatusMessages, ...fontStatusMessages]),
    [extraStatusMessages, fontStatusMessages],
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

  const baseElements = frozenElements ?? elements

  const overlayElementForSelection = useMemo(() => {
    if (selectedIndex == null) {
      return null
    }
    if (dragOverlay?.index === selectedIndex) {
      return dragOverlay.element
    }
    return elements[selectedIndex] ?? null
  }, [dragOverlay, elements, selectedIndex])

  const selectionRenderResult = useMemo(() => {
    if (!overlayElementForSelection) {
      return null
    }
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return renderElement(overlayElementForSelection, renderContext)
  }, [fontAssetKeys, opentypeFonts, overlayElementForSelection, renderContext])

  const selectionBounds = useMemo(() => {
    if (!overlayElementForSelection) {
      return null
    }
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return resolveElementHitBounds(overlayElementForSelection, renderContext)
  }, [fontAssetKeys, opentypeFonts, overlayElementForSelection, renderContext])

  const lineCoords = useMemo(() => {
    if (selectionRenderResult?.layer !== 'svg' || selectionRenderResult.primitive.kind !== 'line') {
      return undefined
    }
    return {
      x1: selectionRenderResult.primitive.x1,
      y1: selectionRenderResult.primitive.y1,
      x2: selectionRenderResult.primitive.x2,
      y2: selectionRenderResult.primitive.y2,
    }
  }, [selectionRenderResult])

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

  const releaseCapturedPointer = useCallback((target: HTMLElement | null, pointerId: number) => {
    if (target?.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }, [])

  const finishDrag = useCallback(() => {
    const session = dragSessionRef.current
    if (session) {
      releaseCapturedPointer(pointerCaptureTargetRef.current, session.pointerId)
    }
    pointerCaptureTargetRef.current = null
    setFrozenElements(null)
    dragSessionRef.current = null
    setDragSession(null)
    setDragOverlay(null)
    onDragActiveChange?.(false)
  }, [onDragActiveChange, releaseCapturedPointer])

  const updateDragVisual = useCallback(
    (index: number, overlayElement: DrawElement, commitElement: DrawElement) => {
      setDragOverlay({ index, element: overlayElement })
      onUpdateElement(index, commitElement)
    },
    [onUpdateElement],
  )

  const beginDragSession = useCallback(
    (session: DragSession) => {
      setFrozenElements(elements)
      dragSessionRef.current = session
      setDragSession(session)
      onDragActiveChange?.(true)
    },
    [elements, onDragActiveChange],
  )

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

      if (!dragging && point) {
        let cursor = 'default'
        if (
          selectedIndex != null &&
          selectionBounds &&
          selectedEditElement &&
          isElementDraggable(selectedEditElement)
        ) {
          const handles = getInteractiveResizeHandles(selectedEditElement)
          const handle = hitResizeHandle(point, selectionBounds, handles, lineCoords)
          if (handle && !shouldPreferMoveOverResize(point, selectionBounds, handle, lineCoords)) {
            cursor = resizeHandleCursor(handle)
          } else {
            const hit = findTopmostElementHit(hitTargets, point)
            const hitElement = hit ? editElements[hit.index] : undefined
            if (hitElement && isElementDraggable(hitElement)) {
              cursor = 'grab'
            }
          }
        } else {
          const hit = findTopmostElementHit(hitTargets, point)
          const hitElement = hit ? editElements[hit.index] : undefined
          if (hitElement && isElementDraggable(hitElement)) {
            cursor = 'grab'
          }
        }
        setHoverCursor(cursor)
      } else if (dragging) {
        setHoverCursor('grabbing')
      }

      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId || !point) {
        return
      }

      didDragRef.current = true
      event.preventDefault()

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
          const canvas = { width: renderContext.width, height: renderContext.height }
          updateDragVisual(
            session.index,
            translateElement(session.startDisplayElement, dx, dy, canvas),
            translateElement(session.startElement, dx, dy, canvas),
          )
        }
        return
      }

      const element = session.startElement
      const displayElement = session.startDisplayElement
      const handle = session.handle
      if (!handle) {
        return
      }

      if (supportsLineEndpointResize(element, handle) && (handle === 'line-start' || handle === 'line-end')) {
        const endpoint = handle === 'line-start' ? 'start' : 'end'
        const snapped = applySnap(point, snapGrid)
        if (displayElement.type === 'line' && element.type === 'line') {
          updateDragVisual(
            session.index,
            applyLineEndpoint(displayElement, endpoint, snapped.x, snapped.y),
            applyLineEndpoint(element, endpoint, snapped.x, snapped.y),
          )
        }
        return
      }

      // Size resizes use raw pointer coords — grid snap applies to move/nudge only, not width/height/radius.
      const pointerX = point.x
      const pointerY = point.y

      if (supportsSeSizeResize(element)) {
        updateDragVisual(
          session.index,
          applySeSizeResize(displayElement, session.startBounds, pointerX, pointerY, handle),
          applySeSizeResize(element, session.startBounds, pointerX, pointerY, handle),
        )
        return
      }

      if (supportsBoxResize(element)) {
        const nextBounds = resizeBoundsWithHandle(session.startBounds, handle, pointerX, pointerY)
        updateDragVisual(
          session.index,
          applyBoundsResize(displayElement, nextBounds),
          applyBoundsResize(element, nextBounds),
        )
      }
    },
    [
      editElements,
      hitTargets,
      lineCoords,
      mapClientToCanvas,
      renderContext.height,
      renderContext.width,
      selectedEditElement,
      selectedIndex,
      selectionBounds,
      snapGrid,
      updateDragVisual,
    ],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current
      if (session && event.pointerId === session.pointerId) {
        releaseCapturedPointer(event.currentTarget, session.pointerId)
        finishDrag()
      }
    },
    [finishDrag, releaseCapturedPointer],
  )

  const handleLostPointerCapture = useCallback(
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

      event.currentTarget.focus({ preventScroll: true })
      didDragRef.current = false
      setDragOverlay(null)

      const topHit = findTopmostElementHit(hitTargets, point)

      if (
        selectedIndex != null &&
        selectionBounds &&
        selectedEditElement &&
        isElementDraggable(selectedEditElement)
      ) {
        const handles = getInteractiveResizeHandles(selectedEditElement)
        const handle = hitResizeHandle(point, selectionBounds, handles, lineCoords)
        if (
          handle &&
          !shouldPreferMoveOverResize(point, selectionBounds, handle, lineCoords)
        ) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = event.currentTarget
          beginDragSession({
            kind: 'resize',
            index: selectedIndex,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: selectedEditElement,
            startDisplayElement: elements[selectedIndex],
            startBounds: selectionBounds,
            handle,
          })
          return
        }
      }

      if (
        selectedIndex != null &&
        selectionBounds &&
        selectedEditElement &&
        topHit?.index === selectedIndex
      ) {
        if (isElementDraggable(selectedEditElement)) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = event.currentTarget
          beginDragSession({
            kind: 'move',
            index: selectedIndex,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: selectedEditElement,
            startDisplayElement: elements[selectedIndex],
            startBounds: selectionBounds,
          })
          return
        }
      }

      if (topHit) {
        onSelectElement(topHit.index)
        const editElement = editElements[topHit.index]
        if (editElement && isElementDraggable(editElement)) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = event.currentTarget
          beginDragSession({
            kind: 'move',
            index: topHit.index,
            pointerId: event.pointerId,
            startCanvas: point,
            startElement: editElement,
            startDisplayElement: elements[topHit.index],
            startBounds: topHit.bounds,
          })
        }
        return
      }

      onSelectElement(null)
    },
    [
      beginDragSession,
      editElements,
      elements,
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
      setHoverCursor('default')
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selectedIndex == null || !shouldHandleCanvasKeyboard(event)) {
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
    selectedEditElement && selectionBounds ? getCanvasResizeHandles(selectedEditElement) : []

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
        <h2 className={`${shell.heading} flex items-baseline gap-2`}>
          <span>Canvas</span>
          <span className="font-mono normal-case tracking-normal text-[var(--shell-muted)]">
            {renderContext.width}×{renderContext.height}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <FeatureToggle
            enabled={showHiddenHints}
            onToggle={onToggleShowHiddenHints}
            title="Show designer overlays for elements invisible on the tag (visible: false, fill: none)"
          >
            <span>Invisible</span>
          </FeatureToggle>
          <FeatureToggle
            enabled={snapGrid.enabled}
            onToggle={onToggleSnap}
            title="Snap moved and resized elements to the grid"
          >
            <span>Snap</span>
          </FeatureToggle>
          <button
            type="button"
            className={`${shell.button} ${previewDitherMode === 2 ? 'border-[var(--shell-accent)] text-[var(--shell-accent)]' : ''}`}
            onClick={onTogglePreviewDither}
          >
            Dither {previewDitherMode === 2 ? 'd=2' : 'flat'}
          </button>
          <button type="button" className={shell.buttonDestructive} onClick={onClearAll}>
            Clear all
          </button>
          {pointer ? (
            <span className={`font-mono text-xs ${shell.muted}`}>
              {Math.round(pointer.x)}, {Math.round(pointer.y)}
            </span>
          ) : null}
        </div>
      </div>
      {statusMessages.map((message, index) => (
        <StatusBanner key={`${message.severity}-${message.title}-${index}`} message={message} />
      ))}
      <div
        ref={containerRef}
        tabIndex={0}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--shell-hover)] p-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--shell-accent)]"
        style={{ cursor: dragSession ? 'grabbing' : hoverCursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={handleLostPointerCapture}
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
          {baseElements.map((element, index) => (
            <CanvasElementSlot
              key={index}
              element={element}
              index={index}
              hidden={dragOverlay?.index === index}
              renderContext={renderContext}
              assetImages={displayAssetImages}
              fontFamilies={fontFamilies}
              opentypeFonts={opentypeFonts}
            />
          ))}
          {dragOverlay ? (
            <CanvasElementSlot
              key={`drag-overlay-${dragOverlay.index}`}
              element={dragOverlay.element}
              index={dragOverlay.index}
              layerZIndex={baseElements.length + dragOverlay.index + 1}
              renderContext={renderContext}
              assetImages={displayAssetImages}
              fontFamilies={fontFamilies}
              opentypeFonts={opentypeFonts}
            />
          ) : null}
          <svg
            viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: baseElements.length + (dragOverlay ? 2 : 1) }}
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
                {resizeHandles.map(({ handle, interactive }) => {
                  const pos = handlePosition(selectionBounds, handle, lineCoords)
                  return (
                    <rect
                      key={handle}
                      x={pos.x - HANDLE_SIZE / 2}
                      y={pos.y - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill={interactive ? HANDLE_FILL_INTERACTIVE : HANDLE_FILL_DISABLED}
                      stroke="#ffffff"
                      strokeWidth={1}
                      aria-hidden={!interactive}
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
