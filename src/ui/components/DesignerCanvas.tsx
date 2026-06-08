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
import {
  CANVAS_VIEWPORT_PADDING_PX,
  clientPointToCanvasCoords,
  computeCanvasStageSize,
  computeCanvasViewportLayout,
  computeEffectiveCanvasScale,
  computeFitScale,
  formatCanvasPointerCoords,
  paperTransform,
  refineCanvasPointerPoint,
  type ViewportSize,
} from '../lib/canvas-zoom'
import { exportPaperDomToPngBlob } from '../lib/canvas-png-export'
import {
  buildPngDownloadFilename,
  copyBlobToClipboard,
  triggerBlobDownload,
} from '../lib/export-download'
import { toolbarGroup, toolbarGroups } from '../lib/export-action-feedback'
import { type ElementBounds } from '../lib/primitive-bounds'
import { resolveElementHitBounds } from '../lib/hidden-element-hints'
import { snapMoveDelta, snapToGrid } from '../lib/snap-to-grid'
import type { SnapGridPrefs } from '../preferences/snapGrid'
import {
  readCanvasZoomMode,
  writeCanvasZoomMode,
  type CanvasZoomMode,
} from '../preferences/canvasZoom'
import type { CanvasRotation } from '../hooks/useProjectState'
import { useExportActionFeedback } from '../hooks/useExportActionFeedback'
import { ExportActionButton } from './ExportActionButton'
import { FeatureToggle } from './FeatureToggle'
import { shell } from '../styles/shell'

interface DesignerCanvasProps {
  elements: DrawElement[]
  editElements: DrawElement[]
  renderContext: RenderContext
  rotation: CanvasRotation
  selectedIndex: number | null
  assetRevision: number
  sessionName: string
  /** Client size of the slot above the YAML divider (from App allocation ref). */
  allocationSize: { width: number; height: number }
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

function applySnap(point: { x: number; y: number }, snapGrid: SnapGridPrefs): { x: number; y: number } {
  return {
    x: snapToGrid(point.x, snapGrid.size, snapGrid.enabled),
    y: snapToGrid(point.y, snapGrid.size, snapGrid.enabled),
  }
}

const ZOOM_MODES: { mode: CanvasZoomMode; label: string }[] = [
  { mode: '200', label: '200%' },
  { mode: '100', label: '100%' },
  { mode: 'fit', label: 'Fit' },
  { mode: '50', label: '50%' },
]

export function DesignerCanvas({
  elements,
  editElements,
  renderContext,
  rotation,
  selectedIndex,
  assetRevision,
  sessionName,
  allocationSize,
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
  const [scrollportSize, setScrollportSize] = useState({ width: 0, height: 0 })
  const [zoomMode, setZoomMode] = useState<CanvasZoomMode>(() => readCanvasZoomMode())
  const { flashSuccess, flashError, getFeedback } = useExportActionFeedback()
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
    const scrollport = containerRef.current
    if (!scrollport) {
      return
    }
    const updateScrollport = () => {
      const { width, height } = scrollport.getBoundingClientRect()
      setScrollportSize({ width, height })
    }
    updateScrollport()
    const observer = new ResizeObserver(updateScrollport)
    observer.observe(scrollport)
    return () => observer.disconnect()
  }, [allocationSize.height, allocationSize.width])

  const viewportSize = useMemo((): ViewportSize | null => {
    if (scrollportSize.width <= 0 || scrollportSize.height <= 0) {
      return null
    }
    return scrollportSize
  }, [scrollportSize])

  const fitScale = useMemo(() => {
    if (!viewportSize) {
      return 1
    }
    const scale = computeFitScale(
      viewportSize.width,
      viewportSize.height,
      renderContext.width,
      renderContext.height,
      rotation,
      CANVAS_VIEWPORT_PADDING_PX,
    )
    return scale > 0 ? scale : 1
  }, [renderContext.height, renderContext.width, rotation, viewportSize])

  const effectiveScale = useMemo(
    () => computeEffectiveCanvasScale(zoomMode, fitScale),
    [fitScale, zoomMode],
  )

  const stageSize = useMemo(
    () =>
      computeCanvasStageSize(
        renderContext.width,
        renderContext.height,
        rotation,
        effectiveScale,
      ),
    [effectiveScale, renderContext.height, renderContext.width, rotation],
  )

  const viewportLayout = useMemo(() => {
    if (!viewportSize) {
      return {
        scrollContentWidth: 0,
        scrollContentHeight: 0,
        centerX: true,
        centerY: true,
        needsScrollX: false,
        needsScrollY: false,
      }
    }
    return computeCanvasViewportLayout(viewportSize, stageSize)
  }, [stageSize, viewportSize])

  useEffect(() => {
    writeCanvasZoomMode(zoomMode)
  }, [zoomMode])

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
      const raw = clientPointToCanvasCoords(
        clientX,
        clientY,
        paper.getBoundingClientRect(),
        renderContext.width,
        renderContext.height,
        rotation,
      )
      if (allowOutside) {
        return raw
      }
      return refineCanvasPointerPoint(raw, renderContext.width, renderContext.height)
    },
    [renderContext.height, renderContext.width, rotation],
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
      setPointer(dragging ? point : point)

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

  const exportPreviewPng = useCallback(async () => {
    const paper = containerRef.current?.querySelector<HTMLElement>('[data-canvas-paper]')
    if (!paper) {
      return null
    }
    return exportPaperDomToPngBlob(paper, renderContext.width, renderContext.height)
  }, [renderContext.height, renderContext.width])

  const handleCopyPng = useCallback(async () => {
    try {
      const blob = await exportPreviewPng()
      if (!blob) {
        return
      }
      const copied = await copyBlobToClipboard(blob)
      if (copied) {
        flashSuccess('copy-png')
      } else {
        flashError('copy-png')
      }
    } catch {
      flashError('copy-png')
    }
  }, [exportPreviewPng, flashError, flashSuccess])

  const handleDownloadPng = useCallback(async () => {
    try {
      const blob = await exportPreviewPng()
      if (!blob) {
        return
      }
      triggerBlobDownload(blob, buildPngDownloadFilename(sessionName))
      flashSuccess('download-png')
    } catch {
      flashError('download-png')
    }
  }, [exportPreviewPng, flashError, flashSuccess, sessionName])

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col ${shell.panel}`}
      aria-label="E-paper canvas"
    >
      <div className={`flex items-center justify-between border-b ${shell.panelBorder} px-4 py-2`}>
        <h2 className={`${shell.heading} flex items-baseline gap-2`}>
          <span>Canvas</span>
          <span className="font-mono normal-case tracking-normal text-[var(--shell-muted)]">
            {renderContext.width}×{renderContext.height}
          </span>
        </h2>
        <div className={toolbarGroups}>
          <div className={toolbarGroup} role="group" aria-label="Canvas zoom">
            {ZOOM_MODES.map(({ mode, label }) => {
              const active = zoomMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  className={
                    active
                      ? 'rounded-md border border-[var(--shell-accent)] bg-[var(--shell-accent)] px-2 py-1 text-xs text-white shadow-inner ring-1 ring-inset ring-black/15'
                      : `${shell.button} opacity-80`
                  }
                  onClick={() => setZoomMode(mode)}
                  aria-pressed={active}
                  aria-current={active ? 'true' : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className={toolbarGroup} role="group" aria-label="Canvas export">
            <ExportActionButton
              actionId="copy-png"
              feedback={getFeedback('copy-png')}
              onClick={() => void handleCopyPng()}
            >
              Copy PNG
            </ExportActionButton>
            <ExportActionButton
              actionId="download-png"
              feedback={getFeedback('download-png')}
              onClick={() => void handleDownloadPng()}
            >
              Download PNG
            </ExportActionButton>
          </div>
          <div className={toolbarGroup} role="group" aria-label="Canvas view options">
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
          </div>
          <div className={toolbarGroup} role="group" aria-label="Canvas actions">
            <button type="button" className={shell.buttonDestructive} onClick={onClearAll}>
              Clear all
            </button>
          </div>
        </div>
      </div>
      {statusMessages.map((message, index) => (
        <StatusBanner key={`${message.severity}-${message.title}-${index}`} message={message} />
      ))}
      <div className="relative min-h-0 flex-1">
        {pointer ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-md bg-[var(--shell-text)]/75 px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--shell-surface)] shadow-sm"
            aria-hidden
          >
            {formatCanvasPointerCoords(pointer, renderContext.width, renderContext.height)}
          </div>
        ) : null}
        <div
          ref={containerRef}
          tabIndex={0}
          className="absolute inset-0 overflow-auto bg-[var(--shell-hover)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--shell-accent)]"
          style={{ cursor: dragSession ? 'grabbing' : hoverCursor }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onLostPointerCapture={handleLostPointerCapture}
          onClick={handleClick}
        >
        {viewportSize ? (
        <div
          className="box-border flex p-6"
          style={{
            width: viewportLayout.scrollContentWidth,
            height: viewportLayout.scrollContentHeight,
            alignItems: viewportLayout.centerY ? 'center' : 'flex-start',
            justifyContent: viewportLayout.centerX ? 'center' : 'flex-start',
          }}
        >
          <div
            data-canvas-stage
            className="relative shrink-0 overflow-hidden bg-white shadow-md"
            style={{
              width: stageSize.width,
              height: stageSize.height,
            }}
          >
            <div
              data-canvas-paper
              className="absolute left-0 top-0"
              style={
                {
                  width: renderContext.width,
                  height: renderContext.height,
                  transform: paperTransform(rotation, effectiveScale),
                  transformOrigin: 'top left',
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
        </div>
        ) : null}
        </div>
      </div>
    </section>
  )
}
