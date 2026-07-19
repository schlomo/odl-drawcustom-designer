import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { safeRenderElement, type DrawElement, type RenderContext } from '../../core'
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
import { getMergedStatusMessages } from '../lib/font-render-status'
import { sortStatusMessages, type StatusMessage } from '../lib/status-messages'
import {
  areOpentypeFontMapsEqual,
  loadOpentypeFontMapWithOutcomes,
} from '../lib/load-opentype-fonts'
import { StatusBanner } from './StatusBanner'
import { findSelectionPriorityHit } from '../lib/canvas-hit-test'
import {
  HANDLE_VISUAL_SIZE,
  handlePosition,
  hitResizeHandle,
  resizeHandleCursor,
  shouldPreferMoveOverResize,
} from '../lib/canvas-resize-handles'
import { shouldHandleCanvasKeyboard } from '../lib/canvas-keyboard'
import { isRedoShortcut, isUndoShortcut } from '../lib/undo-keyboard'
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
import { renderPayloadToPngBlob } from '../lib/canvas-png-export'
import {
  buildPngDownloadFilename,
  copyBlobToClipboard,
  triggerBlobDownload,
} from '../lib/export-download'
import { CANVAS_TOOLBAR_ITEM_SELECTOR } from '../lib/canvas-toolbar-layout'
import { toolbarHeaderSlotWidth } from '../lib/toolbar-header-slot'
import { useToolbarLabels } from '../hooks/useToolbarLabels'
import { useElementSize } from '../hooks/useElementSize'
import { type ElementBounds } from '../lib/primitive-bounds'
import { canAlignSelection, unionBounds, type ElementAlign } from '../lib/align-elements'
import { isElementCanvasSelectable, resolveElementHitBounds } from '../lib/hidden-element-hints'
import { normalizeMarqueeRect } from '../lib/marquee-selection'
import {
  canvasEdgeSnapGuides,
  canvasPointSnapGuides,
  canvasSnapGuideLines,
  snapBoundsToCanvas,
  snapMoveDelta,
  snapPointToCanvas,
  type CanvasSnapEdge,
} from '../lib/snap-to-grid'
import type { SnapGridPrefs } from '../preferences/snapGrid'
import {
  readCanvasZoomMode,
  writeCanvasZoomMode,
  type CanvasZoomMode,
} from '../preferences/canvasZoom'
import type { CanvasRotation, SelectElementOptions } from '../hooks/useProjectState'
import { useExportActionFeedback } from '../hooks/useExportActionFeedback'
import { CanvasSelectionToolbar } from './CanvasSelectionToolbar'
import { CanvasHeaderToolbar } from './CanvasHeaderToolbar'
import { shell } from '../styles/shell'

interface DesignerCanvasProps {
  elements: DrawElement[]
  editElements: DrawElement[]
  renderContext: RenderContext
  rotation: CanvasRotation
  selectedIndices: number[]
  assetRevision: number
  sessionName: string
  /** Client size of the slot above the YAML divider (from App allocation ref). */
  allocationSize: { width: number; height: number }
  snapGrid: SnapGridPrefs
  showHiddenHints: boolean
  onToggleShowHiddenHints: () => void
  extraStatusMessages?: readonly StatusMessage[]
  onSelectElement: (index: number | null, options?: SelectElementOptions) => void
  onSelectAllInRect: (bounds: ElementBounds, additive?: boolean) => void
  onAlignSelection: (align: ElementAlign, boundsByIndex: Map<number, ElementBounds>) => void
  onUpdateElement: (index: number, element: DrawElement) => void
  onUpdateElementsBatch: (updates: ReadonlyMap<number, DrawElement>) => void
  onBringSelectionToFront: () => void
  onSendSelectionToBack: () => void
  onMoveSelectionLayer: (direction: 'up' | 'down') => void
  elementCount: number
  onDeleteSelected: () => void
  onNudgeSelected: (dx: number, dy: number) => void
  onToggleSnap: () => void
  previewDitherMode: 0 | 2
  onTogglePreviewDither: () => void
  onDragActiveChange?: (active: boolean) => void
  /**
   * Pointerdown landed on the already-selected element (non-additive click) —
   * the one case where no onSelectElement call is made, so listeners that
   * react to selection changes never hear about the click.
   */
  onSelectedElementPointerDown?: (index: number) => void
  onBeginEditCoalesce?: () => void
  onEndEditCoalesce?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  /** True while the live YAML doc fails to parse/validate (issue #35) — ignore pointer/keyboard interactions. */
  blocked?: boolean
  /** True once {@link blocked} has held past the visual grace period — show the blocked overlay. */
  blockedVisible?: boolean
}

interface DragOverlay {
  index: number
  element: DrawElement
}

interface DragMoveStart {
  index: number
  startElement: DrawElement
  startDisplayElement: DrawElement
  startBounds: ElementBounds
}

interface DragSession {
  kind: 'move' | 'resize'
  indices: number[]
  pointerId: number
  startCanvas: { x: number; y: number }
  starts: DragMoveStart[]
  handle?: ResizeHandle
}

interface MarqueeSession {
  pointerId: number
  startCanvas: { x: number; y: number }
  additive: boolean
}

const HANDLE_SIZE = HANDLE_VISUAL_SIZE
const HANDLE_FILL_INTERACTIVE = '#3b82f6'
const HANDLE_FILL_DISABLED = '#ef4444'

function applySnap(
  point: { x: number; y: number },
  snapGrid: SnapGridPrefs,
  canvas: { width: number; height: number },
): { x: number; y: number } {
  return snapPointToCanvas(
    point.x,
    point.y,
    canvas.width,
    canvas.height,
    snapGrid.size,
    snapGrid.enabled,
  )
}

export function DesignerCanvas({
  elements,
  editElements,
  renderContext,
  rotation,
  selectedIndices,
  assetRevision,
  sessionName,
  allocationSize,
  snapGrid,
  showHiddenHints,
  onToggleShowHiddenHints,
  extraStatusMessages = [],
  onSelectElement,
  onSelectAllInRect,
  onAlignSelection,
  onUpdateElement,
  onUpdateElementsBatch,
  onBringSelectionToFront,
  onSendSelectionToBack,
  onMoveSelectionLayer,
  elementCount,
  onDeleteSelected,
  onNudgeSelected,
  onToggleSnap,
  previewDitherMode,
  onTogglePreviewDither,
  onDragActiveChange,
  onSelectedElementPointerDown,
  onBeginEditCoalesce,
  onEndEditCoalesce,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  blocked = false,
  blockedVisible = false,
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
  const headerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const headerSize = useElementSize(headerRef)
  const titleSize = useElementSize(titleRef)
  const toolbarSlotWidth = toolbarHeaderSlotWidth(headerSize.width, titleSize.width)
  const { toolbarRef: canvasToolbarRef, showLabels: showCanvasLabels } = useToolbarLabels(
    CANVAS_TOOLBAR_ITEM_SELECTOR,
    {
      fitWidth: toolbarSlotWidth,
      measureRef,
    },
  )
  const [assetImages, setAssetImages] = useState<Map<string, HTMLImageElement>>(() => new Map())
  const [fontFamilies, setFontFamilies] = useState<Map<string, string>>(() => new Map())
  const [opentypeFonts, setOpentypeFonts] = useState<Map<string, import('opentype.js').Font>>(
    () => new Map(),
  )
  const [fontLoadOutcomes, setFontLoadOutcomes] = useState<Map<string, FontLoadOutcome>>(
    () => new Map(),
  )
  const [dragSession, setDragSession] = useState<DragSession | null>(null)
  const [marqueeSession, setMarqueeSession] = useState<MarqueeSession | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<ElementBounds | null>(null)
  const marqueeRectRef = useRef<ElementBounds | null>(null)
  const marqueeSessionRef = useRef<MarqueeSession | null>(null)
  const [dragOverlays, setDragOverlays] = useState<DragOverlay[]>([])
  const [canvasSnapGuides, setCanvasSnapGuides] = useState<CanvasSnapEdge[]>([])
  /** Preview stack frozen at drag start so live YAML/property updates do not re-render every layer. */
  const [frozenElements, setFrozenElements] = useState<DrawElement[] | null>(null)

  useEffect(() => {
    dragSessionRef.current = dragSession
  }, [dragSession])

  useEffect(() => {
    marqueeSessionRef.current = marqueeSession
  }, [marqueeSession])

  const selectedIndex = selectedIndices.length === 1 ? selectedIndices[0]! : selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1]! : null
  const isMultiSelect = selectedIndices.length > 1

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
      if (!isElementCanvasSelectable(element, renderContext)) {
        return []
      }
      const bounds = resolveElementHitBounds(element, renderContext)
      return bounds ? [{ index, bounds }] : []
    })
  }, [elements, fontAssetKeys, renderContext, opentypeFonts])

  // Selection-priority hit-testing (issue #45 ruling) needs to know whether
  // the *selected* candidate at a given index is draggable — keyed by index
  // so canvas-hit-test.ts stays free of the element domain model (see its
  // doc comment). Draggability is judged from editElements, matching every
  // other drag-eligibility check in this component (buildMoveStarts, the
  // resize/move gating below).
  const isHitDraggable = useCallback(
    (index: number) => {
      const element = editElements[index]
      return element != null && isElementDraggable(element)
    },
    [editElements],
  )

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

  // getMergedStatusMessages re-invokes safeRenderElement internally, whose
  // result depends on the core opentype.js font registry (a module-level Map
  // outside React state). opentypeFonts/fontLoadOutcomes are the only
  // React-visible signals that registry changed, so they must stay as
  // dependencies below even though the callback body doesn't reference them
  // directly — otherwise a font that finishes loading (or is confirmed
  // missing/failed) asynchronously, with no corresponding `elements` change,
  // would leave a stale banner even though the canvas placeholder already
  // updated. One failure = one banner (maintainer ruling): this also merges
  // a font-unavailable render-error banner with its font-status banner
  // instead of showing both — see font-render-status.ts.
  const fontAndRenderStatusMessages = useMemo(
    () => getMergedStatusMessages(elements, renderContext, fontLoadOutcomes, fontsLoading),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [elements, renderContext, fontLoadOutcomes, fontsLoading, opentypeFonts],
  )

  const statusMessages = useMemo(
    () => sortStatusMessages([...extraStatusMessages, ...fontAndRenderStatusMessages]),
    [extraStatusMessages, fontAndRenderStatusMessages],
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

  const selectionBoundsByIndex = useMemo(() => {
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    const map = new Map<number, ElementBounds>()
    for (const index of selectedIndices) {
      const element = elements[index]
      if (!element) {
        continue
      }
      const bounds = resolveElementHitBounds(element, renderContext)
      if (bounds) {
        map.set(index, bounds)
      }
    }
    return map
  }, [elements, fontAssetKeys, opentypeFonts, renderContext, selectedIndices])

  const overlayElementForSelection = useMemo(() => {
    if (selectedIndex == null || isMultiSelect) {
      return null
    }
    const overlay = dragOverlays.find((entry) => entry.index === selectedIndex)
    if (overlay) {
      return overlay.element
    }
    return elements[selectedIndex] ?? null
  }, [dragOverlays, elements, isMultiSelect, selectedIndex])

  const selectionBounds = useMemo(() => {
    if (!overlayElementForSelection) {
      if (isMultiSelect) {
        return unionBounds([...selectionBoundsByIndex.values()])
      }
      return null
    }
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return resolveElementHitBounds(overlayElementForSelection, renderContext)
  }, [
    fontAssetKeys,
    isMultiSelect,
    opentypeFonts,
    overlayElementForSelection,
    renderContext,
    selectionBoundsByIndex,
  ])

  const selectionRenderResult = useMemo(() => {
    if (!overlayElementForSelection) {
      return null
    }
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return safeRenderElement(overlayElementForSelection, renderContext)
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

  const finishMarquee = useCallback(() => {
    const session = marqueeSessionRef.current
    marqueeSessionRef.current = null
    setMarqueeSession(null)
    const rect = marqueeRectRef.current
    marqueeRectRef.current = null
    setMarqueeRect(null)
    if (!session) {
      return
    }
    if (rect && (rect.width >= 2 || rect.height >= 2)) {
      onSelectAllInRect(rect, session.additive)
      return
    }
    if (!session.additive) {
      onSelectElement(null)
    }
  }, [onSelectAllInRect, onSelectElement])

  const finishDrag = useCallback(() => {
    const session = dragSessionRef.current
    if (session) {
      releaseCapturedPointer(pointerCaptureTargetRef.current, session.pointerId)
    }
    pointerCaptureTargetRef.current = null
    setFrozenElements(null)
    dragSessionRef.current = null
    setDragSession(null)
    setDragOverlays([])
    setCanvasSnapGuides([])
    onDragActiveChange?.(false)
    onEndEditCoalesce?.()
  }, [onDragActiveChange, onEndEditCoalesce, releaseCapturedPointer])

  const updateBulkMoveVisual = useCallback(
    (
      starts: DragMoveStart[],
      dx: number,
      dy: number,
    ) => {
      const canvas = { width: renderContext.width, height: renderContext.height }
      const updates = new Map<number, DrawElement>()
      const overlays: DragOverlay[] = []
      for (const start of starts) {
        updates.set(start.index, translateElement(start.startElement, dx, dy, canvas))
        overlays.push({
          index: start.index,
          element: translateElement(start.startDisplayElement, dx, dy, canvas),
        })
      }
      setDragOverlays(overlays)
      onUpdateElementsBatch(updates)
    },
    [onUpdateElementsBatch, renderContext.height, renderContext.width],
  )

  const updateDragVisual = useCallback(
    (index: number, overlayElement: DrawElement, commitElement: DrawElement) => {
      setDragOverlays([{ index, element: overlayElement }])
      onUpdateElement(index, commitElement)
    },
    [onUpdateElement],
  )

  const beginMarqueeSession = useCallback(
    (
      target: HTMLElement,
      pointerId: number,
      startCanvas: { x: number; y: number },
      additive: boolean,
    ) => {
      target.setPointerCapture(pointerId)
      pointerCaptureTargetRef.current = target
      marqueeSessionRef.current = {
        pointerId,
        startCanvas,
        additive,
      }
      setMarqueeSession(marqueeSessionRef.current)
    },
    [],
  )

  const beginDragSession = useCallback(
    (session: DragSession) => {
      onBeginEditCoalesce?.()
      setFrozenElements(elements)
      dragSessionRef.current = session
      setDragSession(session)
      onDragActiveChange?.(true)
    },
    [elements, onBeginEditCoalesce, onDragActiveChange],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragging = dragSessionRef.current != null
      const marqueing = marqueeSessionRef.current != null
      const point = mapClientToCanvas(event.clientX, event.clientY, dragging || marqueing)
      setPointer(point)

      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId && point) {
        didDragRef.current = true
        const rect = normalizeMarqueeRect(marquee.startCanvas, point)
        marqueeRectRef.current = rect
        setMarqueeRect(rect)
      }

      if (!dragging && !marqueing && point) {
        let cursor = 'default'
        let resolvedByResizeHandle = false
        if (
          !isMultiSelect &&
          selectedIndex != null &&
          selectionBounds &&
          selectedEditElement
        ) {
          const handles = getInteractiveResizeHandles(selectedEditElement)
          const handle = hitResizeHandle(point, selectionBounds, handles, lineCoords)
          if (handle && !shouldPreferMoveOverResize(point, selectionBounds, handle, lineCoords)) {
            cursor = resizeHandleCursor(handle)
            resolvedByResizeHandle = true
          }
        }
        if (!resolvedByResizeHandle) {
          // Selection-priority routing (issue #45 ruling) must drive the
          // hover affordance the same way it drives pointerdown below, so a
          // selected element that is draggable and buried under a
          // same-or-larger occluder still shows `grab`, while a selected
          // full-canvas element never masks the grab affordance of a
          // smaller element painted on top of it.
          const hit = findSelectionPriorityHit(hitTargets, point, selectedIndices, isHitDraggable)
          const hitElement = hit ? editElements[hit.index] : undefined
          if (hitElement && isElementDraggable(hitElement)) {
            cursor = 'grab'
          }
        }
        setHoverCursor(cursor)
      } else if (dragging) {
        setHoverCursor('grabbing')
      } else if (marqueing) {
        setHoverCursor('crosshair')
      }

      const session = dragSessionRef.current
      if (!session || event.pointerId !== session.pointerId || !point) {
        return
      }

      didDragRef.current = true
      event.preventDefault()

      if (session.kind === 'move') {
        const primary = session.starts[0]
        if (!primary) {
          return
        }
        const rawDx = point.x - session.startCanvas.x
        const rawDy = point.y - session.startCanvas.y
        const canvas = { width: renderContext.width, height: renderContext.height }
        const snapBounds =
          session.starts.length === 1
            ? primary.startBounds
            : unionBounds(session.starts.map((start) => start.startBounds))
        if (!snapBounds) {
          return
        }
        const rawTarget = {
          x: snapBounds.x + rawDx,
          y: snapBounds.y + rawDy,
          width: snapBounds.width,
          height: snapBounds.height,
        }
        setCanvasSnapGuides(
          canvasEdgeSnapGuides(
            rawTarget,
            canvas.width,
            canvas.height,
            snapGrid.size,
            snapGrid.enabled,
          ),
        )
        const { dx, dy } = snapMoveDelta(
          snapBounds,
          rawDx,
          rawDy,
          snapGrid.size,
          snapGrid.enabled,
          canvas,
        )
        if (dx !== 0 || dy !== 0) {
          if (session.starts.length === 1) {
            updateDragVisual(
              primary.index,
              translateElement(primary.startDisplayElement, dx, dy, canvas),
              translateElement(primary.startElement, dx, dy, canvas),
            )
          } else {
            updateBulkMoveVisual(session.starts, dx, dy)
          }
        }
        return
      }

      const primary = session.starts[0]
      if (!primary) {
        return
      }
      const element = primary.startElement
      const displayElement = primary.startDisplayElement
      const handle = session.handle
      if (!handle) {
        return
      }

      if (supportsLineEndpointResize(element, handle) && (handle === 'line-start' || handle === 'line-end')) {
        const endpoint = handle === 'line-start' ? 'start' : 'end'
        const snapped = applySnap(point, snapGrid, {
          width: renderContext.width,
          height: renderContext.height,
        })
        setCanvasSnapGuides(
          canvasPointSnapGuides(
            snapped.x,
            snapped.y,
            renderContext.width,
            renderContext.height,
            snapGrid.size,
            snapGrid.enabled,
          ),
        )
        if (displayElement.type === 'line' && element.type === 'line') {
          updateDragVisual(
            primary.index,
            applyLineEndpoint(displayElement, endpoint, snapped.x, snapped.y),
            applyLineEndpoint(element, endpoint, snapped.x, snapped.y),
          )
        }
        return
      }

      const snappedPointer = applySnap(point, snapGrid, {
        width: renderContext.width,
        height: renderContext.height,
      })
      const pointerX = snappedPointer.x
      const pointerY = snappedPointer.y
      setCanvasSnapGuides(
        canvasPointSnapGuides(
          pointerX,
          pointerY,
          renderContext.width,
          renderContext.height,
          snapGrid.size,
          snapGrid.enabled,
        ),
      )

      if (supportsSeSizeResize(element)) {
        updateDragVisual(
          primary.index,
          applySeSizeResize(displayElement, primary.startBounds, pointerX, pointerY, handle),
          applySeSizeResize(element, primary.startBounds, pointerX, pointerY, handle),
        )
        return
      }

      if (supportsBoxResize(element)) {
        const rawBounds = resizeBoundsWithHandle(primary.startBounds, handle, pointerX, pointerY)
        const nextBounds = snapBoundsToCanvas(
          rawBounds,
          renderContext.width,
          renderContext.height,
          snapGrid.size,
          snapGrid.enabled,
          { preserveSize: false },
        )
        setCanvasSnapGuides(
          canvasEdgeSnapGuides(
            rawBounds,
            renderContext.width,
            renderContext.height,
            snapGrid.size,
            snapGrid.enabled,
          ),
        )
        updateDragVisual(
          primary.index,
          applyBoundsResize(displayElement, nextBounds),
          applyBoundsResize(element, nextBounds),
        )
      }
    },
    [
      editElements,
      hitTargets,
      isHitDraggable,
      isMultiSelect,
      lineCoords,
      mapClientToCanvas,
      renderContext.height,
      renderContext.width,
      selectedEditElement,
      selectedIndex,
      selectedIndices,
      selectionBounds,
      snapGrid,
      updateBulkMoveVisual,
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
      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId) {
        releaseCapturedPointer(event.currentTarget, marquee.pointerId)
        finishMarquee()
      }
    },
    [finishDrag, finishMarquee, releaseCapturedPointer],
  )

  const handleLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current
      if (session && event.pointerId === session.pointerId) {
        finishDrag()
      }
      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId) {
        finishMarquee()
      }
    },
    [finishDrag, finishMarquee],
  )

  const buildMoveStarts = useCallback(
    (indices: number[]): DragMoveStart[] =>
      indices.flatMap((index) => {
        const startElement = editElements[index]
        const startDisplayElement = elements[index]
        const startBounds = hitTargets.find((target) => target.index === index)?.bounds
        if (!startElement || !startDisplayElement || !startBounds) {
          return []
        }
        return [{ index, startElement, startDisplayElement, startBounds }]
      }),
    [editElements, elements, hitTargets],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (blocked) {
        return
      }

      const paperPoint = mapClientToCanvas(event.clientX, event.clientY, false)
      const canvasPoint = paperPoint ?? mapClientToCanvas(event.clientX, event.clientY, true)
      if (!canvasPoint) {
        return
      }

      event.currentTarget.focus({ preventScroll: true })
      didDragRef.current = false
      setDragOverlays([])
      setMarqueeRect(null)
      marqueeRectRef.current = null

      const onPaper = paperPoint != null
      const interactionPoint = paperPoint ?? canvasPoint
      // Selection-priority hit-testing (issue #36, refined by #45's ruling):
      // a selected, draggable element under the point wins over plain
      // topmost-wins stacking order when it's occluded by a same-or-larger
      // topmost candidate there — so a buried selected element (e.g. under a
      // full-canvas background) stays draggable, but a selected full-canvas
      // element (e.g. debug_grid) never locks out clicks on smaller elements
      // painted on top of it. Falls back to findTopmostElementHit otherwise,
      // so unselected-canvas behavior is unchanged.
      const topHit = onPaper
        ? findSelectionPriorityHit(hitTargets, interactionPoint, selectedIndices, isHitDraggable)
        : null
      const additive = event.shiftKey
      const forceMarquee = event.altKey

      const startMarquee = () => {
        event.preventDefault()
        beginMarqueeSession(event.currentTarget, event.pointerId, canvasPoint, additive)
      }

      if (!onPaper || forceMarquee) {
        if (!additive && !forceMarquee) {
          onSelectElement(null)
        }
        startMarquee()
        return
      }

      if (
        !isMultiSelect &&
        selectedIndex != null &&
        selectionBounds &&
        selectedEditElement
      ) {
        const handles = getInteractiveResizeHandles(selectedEditElement)
        const handle = hitResizeHandle(interactionPoint, selectionBounds, handles, lineCoords)
        if (
          handle &&
          !shouldPreferMoveOverResize(interactionPoint, selectionBounds, handle, lineCoords)
        ) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = event.currentTarget
          beginDragSession({
            kind: 'resize',
            indices: [selectedIndex],
            pointerId: event.pointerId,
            startCanvas: interactionPoint,
            starts: buildMoveStarts([selectedIndex]),
            handle,
          })
          return
        }
      }

      if (topHit) {
        const wasSelected = selectedIndices.includes(topHit.index)
        if (additive) {
          onSelectElement(topHit.index, { additive: true })
          if (wasSelected) {
            return
          }
        } else if (!wasSelected) {
          onSelectElement(topHit.index)
        } else {
          onSelectedElementPointerDown?.(topHit.index)
        }

        const moveIndices =
          topHit && selectedIndices.includes(topHit.index) && selectedIndices.length > 1
            ? selectedIndices
            : additive
              ? [...new Set([...selectedIndices, topHit.index])].sort((left, right) => left - right)
              : wasSelected
                ? selectedIndices
                : [topHit.index]

        const draggableStarts = buildMoveStarts(moveIndices).filter((start) =>
          isElementDraggable(start.startElement),
        )
        if (draggableStarts.length > 0) {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointerCaptureTargetRef.current = event.currentTarget
          beginDragSession({
            kind: 'move',
            indices: draggableStarts.map((start) => start.index),
            pointerId: event.pointerId,
            startCanvas: interactionPoint,
            starts: draggableStarts,
          })
        }
        return
      }

      if (!additive) {
        onSelectElement(null)
      }
      startMarquee()
    },
    [
      beginDragSession,
      beginMarqueeSession,
      blocked,
      buildMoveStarts,
      hitTargets,
      isHitDraggable,
      isMultiSelect,
      lineCoords,
      mapClientToCanvas,
      onSelectElement,
      onSelectedElementPointerDown,
      selectedEditElement,
      selectedIndex,
      selectedIndices,
      selectionBounds,
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
      if (!shouldHandleCanvasKeyboard(event)) {
        return
      }

      if (blocked) {
        return
      }

      if (isUndoShortcut(event)) {
        event.preventDefault()
        onUndo?.()
        return
      }
      if (isRedoShortcut(event)) {
        event.preventDefault()
        onRedo?.()
        return
      }

      if (selectedIndices.length === 0) {
        return
      }

      const step = event.shiftKey ? 10 : snapGrid.enabled ? snapGrid.size : 1

      switch (event.key) {
        // Escape hatch for selection-priority hit-testing (#36): with a
        // full-canvas element (e.g. the demo's debug_grid) there is no empty
        // canvas spot to click for deselection. Runs after the empty-selection
        // early return, so Escape without a selection stays untouched, and
        // shouldHandleCanvasKeyboard already yields to CodeMirror and form
        // fields.
        case 'Escape':
          event.preventDefault()
          onSelectElement(null)
          break
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
  }, [
    blocked,
    onDeleteSelected,
    onNudgeSelected,
    onRedo,
    onSelectElement,
    onUndo,
    selectedIndices,
    snapGrid.enabled,
    snapGrid.size,
  ])

  const overlayIndices = useMemo(
    () => new Set(dragOverlays.map((entry) => entry.index)),
    [dragOverlays],
  )

  const resizeHandles =
    !isMultiSelect && selectedEditElement && selectionBounds
      ? getCanvasResizeHandles(selectedEditElement)
      : []

  const canMoveSelectionUp = selectedIndices.some((index) => index < elementCount - 1)
  const canMoveSelectionDown = selectedIndices.some((index) => index > 0)
  const canAlignMultiSelection = canAlignSelection(editElements, selectedIndices)

  const canvasSnapGuideOverlay = useMemo(() => {
    if (!snapGrid.enabled || canvasSnapGuides.length === 0) {
      return null
    }
    return canvasSnapGuideLines(canvasSnapGuides, renderContext.width, renderContext.height)
  }, [canvasSnapGuides, renderContext.height, renderContext.width, snapGrid.enabled])

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
    return renderPayloadToPngBlob({
      elements: baseElements,
      renderContext: {
        ...renderContext,
        showHiddenHints: false,
      },
      rotation,
      assetImages: displayAssetImages,
      fontFamilies,
      opentypeFonts,
    })
  }, [
    baseElements,
    displayAssetImages,
    fontFamilies,
    opentypeFonts,
    renderContext,
    rotation,
  ])

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

  const toolbarProps = {
    showLabels: showCanvasLabels,
    zoomMode,
    onZoomModeChange: setZoomMode,
    getFeedback,
    onCopyPng: () => void handleCopyPng(),
    onDownloadPng: () => void handleDownloadPng(),
    canUndo,
    canRedo,
    onUndo: () => onUndo?.(),
    onRedo: () => onRedo?.(),
    showHiddenHints,
    onToggleShowHiddenHints,
    snapGrid,
    onToggleSnap,
    previewDitherMode,
    onTogglePreviewDither,
    blocked,
  }

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col ${shell.panel}`}
      aria-label="E-paper canvas"
    >
      <div
        ref={headerRef}
        className={`relative flex min-w-0 items-center justify-between gap-2 overflow-visible border-b ${shell.panelBorder} px-4 py-2`}
      >
        <h2 ref={titleRef} className={`${shell.heading} shrink-0`}>
          Canvas
        </h2>
        <div ref={canvasToolbarRef} className="shrink-0">
          <CanvasHeaderToolbar {...toolbarProps} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none invisible fixed top-0 -left-[10000px] h-0 overflow-hidden"
        >
          <div ref={measureRef} className="w-max whitespace-nowrap">
            <CanvasHeaderToolbar {...toolbarProps} measureOnly canUndo canRedo />
          </div>
        </div>
      </div>
      {statusMessages.map((message, index) => (
        <StatusBanner key={`${message.severity}-${message.title}-${index}`} message={message} />
      ))}
      <div className="relative min-h-0 flex-1">
        <CanvasSelectionToolbar
          blocked={blocked}
          selectionCount={selectedIndices.length}
          canAlign={canAlignMultiSelection}
          canMoveUp={canMoveSelectionUp}
          canMoveDown={canMoveSelectionDown}
          onAlign={onAlignSelection}
          boundsByIndex={selectionBoundsByIndex}
          onBringToFront={onBringSelectionToFront}
          onSendToBack={onSendSelectionToBack}
          onMoveUp={() => onMoveSelectionLayer('up')}
          onMoveDown={() => onMoveSelectionLayer('down')}
        />
        {pointer ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-md bg-[var(--shell-text)]/75 px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--shell-surface)] shadow-sm"
            aria-hidden
          >
            {formatCanvasPointerCoords(pointer, renderContext.width, renderContext.height)}
          </div>
        ) : null}
        {blockedVisible ? (
          <div
            data-testid="canvas-blocked-overlay"
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[var(--shell-bg)]/70 p-4 text-center backdrop-blur-[1px]`}
          >
            <p
              className={`rounded-md border ${shell.panelBorder} ${shell.panel} px-3 py-1.5 text-sm ${shell.muted}`}
            >
              YAML has errors — fix to continue editing visually
            </p>
          </div>
        ) : null}
        <div
          ref={containerRef}
          tabIndex={0}
          data-testid="canvas-viewport"
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
                  transform: paperTransform(
                    rotation,
                    effectiveScale,
                    renderContext.width,
                    renderContext.height,
                  ),
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
              hidden={overlayIndices.has(index)}
              renderContext={renderContext}
              assetImages={displayAssetImages}
              fontFamilies={fontFamilies}
              opentypeFonts={opentypeFonts}
              fontLoadOutcomes={fontLoadOutcomes}
            />
          ))}
          {dragOverlays.map((overlay) => (
            <CanvasElementSlot
              key={`drag-overlay-${overlay.index}`}
              element={overlay.element}
              index={overlay.index}
              layerZIndex={baseElements.length + overlay.index + 1}
              renderContext={renderContext}
              assetImages={displayAssetImages}
              fontFamilies={fontFamilies}
              opentypeFonts={opentypeFonts}
              fontLoadOutcomes={fontLoadOutcomes}
            />
          ))}
          <svg
            viewBox={`0 0 ${renderContext.width} ${renderContext.height}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: baseElements.length + dragOverlays.length + 1 }}
            aria-hidden
          >
            {isMultiSelect
              ? [...selectionBoundsByIndex.entries()].map(([index, bounds]) => (
                  <rect
                    key={`sel-${index}`}
                    x={bounds.x - 2}
                    y={bounds.y - 2}
                    width={bounds.width + 4}
                    height={bounds.height + 4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                ))
              : null}
            {selectionBounds && !isMultiSelect ? (
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
            {marqueeRect ? (
              <rect
                x={marqueeRect.x}
                y={marqueeRect.y}
                width={marqueeRect.width}
                height={marqueeRect.height}
                fill="rgba(59, 130, 246, 0.08)"
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            ) : null}
            {canvasSnapGuideOverlay?.map((line) => (
              <g key={`canvas-snap-${line.edge}`}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeOpacity={0.95}
                />
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#e11d48"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                />
              </g>
            ))}
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
