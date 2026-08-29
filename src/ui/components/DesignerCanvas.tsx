import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
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
  loadAssetImageMapWithOutcomes,
  pruneAssetImagesForKeys,
} from '../lib/load-asset-images'
import { areImageLoadOutcomeMapsEqual, type ImageLoadOutcome } from '../lib/image-load-outcome'
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
  buildDisplayPreviewPngDownloadFilename,
  buildPngDownloadFilename,
  copyBlobToClipboard,
  triggerBlobDownload,
} from '../lib/export-download'
import { CANVAS_TOOLBAR_ITEM_SELECTOR } from '../lib/canvas-toolbar-layout'
import { toolbarHeaderSlotWidth } from '../lib/toolbar-header-slot'
import { useToolbarLabels } from '../hooks/useToolbarLabels'
import { useElementSize } from '../hooks/useElementSize'
import { useStableAssetKeys } from '../hooks/useStableAssetKeys'
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
import type { SelectElementOptions } from '../hooks/useProjectState'
import { useExportActionFeedback } from '../hooks/useExportActionFeedback'
import { usePublishedCallback } from '../hooks/usePublishedCallback'
import { CanvasSelectionToolbar } from './CanvasSelectionToolbar'
import { CanvasHeaderToolbar } from './CanvasHeaderToolbar'
import { DisplayPreviewImage } from './DisplayPreviewImage'
import { DisplayPreviewStatus } from './DisplayPreviewStatus'
import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { ToolbarTooltip } from './ToolbarTooltip'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import {
  DISPLAY_PREVIEW_NOT_READY_MESSAGE,
  type DisplayPreviewView,
} from '../hooks/useDisplayPreview'
import { shell } from '../styles/shell'

interface DesignerCanvasProps {
  elements: DrawElement[]
  editElements: DrawElement[]
  renderContext: RenderContext
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
  /**
   * True cancel of an in-flight coalesced edit (issue #149 follow-up review
   * M1/M2): drops the coalescing bookkeeping AND restores the elements
   * array to the coalesce-start snapshot, unlike `onEndEditCoalesce` which
   * commits whatever the gesture left behind as one undo entry. A second
   * finger landing mid-drag/resize uses this — escalating to 2-finger
   * navigation aborts the drag, it doesn't finish it.
   */
  onCancelEditCoalesce?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  /**
   * No element mutation and no canvas interaction: the live YAML doc fails to
   * parse/validate (issue #35), or the host display preview is showing
   * (issue #109) — both mean pointer and keyboard edits are ignored.
   */
  blocked?: boolean
  /** True once the YAML doc has been {@link blocked} past the visual grace period — show the blocked overlay. */
  blockedVisible?: boolean
  /**
   * The host-rendered display preview (issue #109, ADR-018 preview seam), or
   * `undefined` for a runtime with no provider — then no toggle and no other
   * visual trace is rendered at all.
   */
  displayPreview?: DisplayPreviewView
  /**
   * Published with the designer's own PNG-export source (issue #109 review,
   * maintainer-ruled demo fix): App forwards this to
   * `DesignerHost.registerRenderSource`, which is what backs
   * `MountHandle.getPngBlob()` — a host with no rendering backend of its own
   * reads the designer's own rasterization instead of building a second
   * renderer. Parent-owned, published the same way `YamlPanel`'s
   * `flushPendingRef`/`discardPendingRef` are.
   */
  pngBlobSourceRef?: RefObject<(() => Promise<Blob>) | null>
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
  /**
   * Selection at the moment this marquee began (review finding M1, round 5)
   * — captured before the non-additive pointerdown branches' own
   * `onSelectElement(null)` deselect, which fires outside this session's
   * lifecycle and so can't be undone by the cancel path alone. Restored
   * verbatim if the session is cancelled (2nd-finger escalation to
   * navigation) rather than committed; irrelevant to a normal commit, which
   * computes its own next selection from the marquee rect.
   */
  previousSelection: readonly number[]
}

/**
 * Issue #155: 2-finger navigation (pan + pinch zoom), the feature half of the
 * #149-follow-up gesture split — 1-finger is always intent (drag/resize/
 * marquee), 2-finger is always navigation, on both the paper and the
 * padding. `ids` is fixed for the session's lifetime: a 3rd finger touching
 * down is tracked in `activePointersRef` for bookkeeping but never joins the
 * gesture, and the session ends the moment either original finger lifts (no
 * retroactive 1-finger drag from whichever finger remains — lift both and
 * re-touch to start a new gesture).
 */
interface TwoFingerSession {
  ids: readonly [number, number]
  /** Client-space midpoint of the two touches, updated every move (pan delta). */
  midpoint: { x: number; y: number }
  /** Client-space distance between the two touches the last time a pinch zoom step fired (or session start). */
  referenceDistance: number
}

/** Ascending explicit zoom levels a pinch steps between — three of the four values the toolbar's zoom buttons expose (`canvasZoom.ts`); `fit` is deliberately not one of them, see {@link nextZoomModeForPinch}. Pinch never introduces a continuous/arbitrary zoom value. */
const PINCH_ZOOM_STEP_ORDER: readonly ('50' | '100' | '200')[] = ['50', '100', '200']

/**
 * Two touch points must spread (or close) by this ratio, relative to the
 * *last step* (not the gesture's start), to fire one zoom step — a single
 * continuous pinch can ratchet through multiple steps (e.g. `fit` → `100`
 * → `200` in one spread) by re-crossing this ratio again from each new
 * reference distance; it is not a one-step-per-gesture cap.
 */
const PINCH_ZOOM_STEP_RATIO = 1.4

/**
 * Issue #149 follow-up (round 7): a two-finger session ending and a new one
 * starting within this many milliseconds is treated as the SAME physical
 * pinch continuing through a digitizer-level touch respawn (see
 * `pinchContinuityRef`'s doc comment), not two separate gestures.
 */
const PINCH_CONTINUITY_WINDOW_MS = 300

function explicitZoomScale(mode: '50' | '100' | '200'): number {
  return mode === '50' ? 0.5 : mode === '100' ? 1 : 2
}

/**
 * `fit` has no fixed position in {@link PINCH_ZOOM_STEP_ORDER} — its scale
 * (`fitScale`) is computed from the viewport, and can land anywhere,
 * including *beyond* every explicit level (a small canvas in a big
 * viewport can fit at well over 200%; a huge canvas can fit at well under
 * 50%). A pinch from `fit` must land on the nearest explicit level
 * strictly ABOVE `fitScale` for `'increase'` and strictly BELOW it for
 * `'decrease'` — never a level that sits the opposite way from `fitScale`
 * than the finger gesture asked for, which is what hardcoding `fit → 100`
 * / `fit → 50` did (review finding B1: a 159%-fit canvas pinched OUT
 * landed on 100%, i.e. it SHRANK). If no explicit level exists in that
 * direction (fit's scale is already beyond the whole range), the pinch is
 * a no-op — returning `current` unchanged, never a wrong-direction jump.
 */
function nextZoomModeForPinch(
  current: CanvasZoomMode,
  direction: 'increase' | 'decrease',
  fitScale: number,
): CanvasZoomMode {
  if (current === 'fit') {
    const inDirection =
      direction === 'increase'
        ? PINCH_ZOOM_STEP_ORDER.filter((mode) => explicitZoomScale(mode) > fitScale)
        : [...PINCH_ZOOM_STEP_ORDER]
            .reverse()
            .filter((mode) => explicitZoomScale(mode) < fitScale)
    return inDirection[0] ?? current
  }
  const index = PINCH_ZOOM_STEP_ORDER.indexOf(current)
  const nextIndex =
    direction === 'increase'
      ? Math.min(index + 1, PINCH_ZOOM_STEP_ORDER.length - 1)
      : Math.max(index - 1, 0)
  return PINCH_ZOOM_STEP_ORDER[nextIndex]!
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
  onCancelEditCoalesce,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  blocked = false,
  blockedVisible = false,
  displayPreview,
  pngBlobSourceRef,
}: DesignerCanvasProps) {
  const previewActive = displayPreview?.active ?? false
  const previewDisabledReason = displayPreview?.disabledReason ?? null
  const previewReasonId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null)
  const didDragRef = useRef(false)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string>('default')
  const [scrollportSize, setScrollportSize] = useState({ width: 0, height: 0 })
  const [zoomMode, setZoomMode] = useState<CanvasZoomMode>(() => readCanvasZoomMode())
  const { flashSuccess, flashError, getFeedback, getFeedbackMessage } = useExportActionFeedback()
  const headerRef = useRef<HTMLDivElement>(null)
  // Measures the whole heading group (title + Display preview toggle), which
  // is what actually competes with the toolbar for header width.
  const titleRef = useRef<HTMLDivElement>(null)
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
  const [imageLoadOutcomes, setImageLoadOutcomes] = useState<Map<string, ImageLoadOutcome>>(
    () => new Map(),
  )
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
  /**
   * Issue #149 follow-up / #155: every currently-down pointer's last known
   * client position, keyed by `pointerId` — Pointer Events give one event
   * stream per contact but no "list active touches" API the way `TouchEvent`
   * does, so this is the app's own multi-pointer registry. Populated on
   * pointerdown, updated on pointermove, pruned on pointerup/lost-capture.
   * Drives both "is this the 2nd finger" (defect fix) and the 2-finger pan/
   * zoom gesture (#155).
   */
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const twoFingerSessionRef = useRef<TwoFingerSession | null>(null)
  const twoFingerCaptureTargetRef = useRef<HTMLElement | null>(null)
  /**
   * Issue #149 follow-up (round 7, maintainer hardware diagnosis via the
   * touchdebug overlay): on some digitizers, a sustained pinch is not one
   * continuous 2-finger contact — the hardware kills and respawns a touch
   * mid-gesture (observed: an "up" for one id immediately followed by a
   * "down" for a fresh id, fingers never lifted). Each respawn ends the old
   * `TwoFingerSession` and `maybeStartTwoFingerSession` would otherwise take
   * a fresh `referenceDistance` at the *current* spread — so the pinch's
   * accumulated spread since the gesture truly began is lost and the
   * 1.4x step ratio (`PINCH_ZOOM_STEP_RATIO`) never re-triggers ("zoom
   * worked twice then stopped"). Stashed by `finishTwoFingerSession`
   * whenever a session actually ends; consumed by `maybeStartTwoFingerSession`
   * if a new session starts within `PINCH_CONTINUITY_WINDOW_MS` (inheriting
   * the OLD referenceDistance instead of measuring a fresh one), cleared on
   * inherit, on going stale past the window, and on any 1-finger session
   * start (`beginDragSession`/`beginMarqueeSession`) — a genuine new
   * 1-finger gesture is not a pinch respawn.
   */
  const pinchContinuityRef = useRef<{ endedAt: number; referenceDistance: number } | null>(null)
  /**
   * Set the instant a pinch fires a zoom step; consumed by the layout effect
   * below once the resulting `effectiveScale` has actually painted, to keep
   * the pinched canvas point under the gesture's midpoint.
   */
  const pendingZoomAnchorRef = useRef<{
    canvasPoint: { x: number; y: number }
    clientX: number
    clientY: number
  } | null>(null)
  /**
   * Bumped every time `pendingZoomAnchorRef` is set (review finding m1):
   * the consuming layout effect depends on this, not on `effectiveScale`
   * alone — a `setZoomMode` call can leave `effectiveScale` numerically
   * unchanged (e.g. `fit`'s scale happens to equal an explicit level's), in
   * which case `effectiveScale`/`viewportLayout` are the same object/value
   * as last render and the effect would never re-run, leaving the anchor to
   * strand and wrongly apply to some later, unrelated scale change.
   */
  const [zoomAnchorTick, setZoomAnchorTick] = useState(0)
  const [dragOverlays, setDragOverlays] = useState<DragOverlay[]>([])
  const [canvasSnapGuides, setCanvasSnapGuides] = useState<CanvasSnapEdge[]>([])
  /** Preview stack frozen at drag start so live YAML/property updates do not re-render every layer. */
  const [frozenElements, setFrozenElements] = useState<DrawElement[] | null>(null)

  /**
   * The element stack held still for the duration of a drag: the painted base
   * layers, and — since issue #124 — the hit targets derived below. The moving
   * element is drawn from `dragOverlays` on top of it.
   */
  const baseElements = frozenElements ?? elements

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
      CANVAS_VIEWPORT_PADDING_PX,
    )
    return scale > 0 ? scale : 1
  }, [renderContext.height, renderContext.width, viewportSize])

  const effectiveScale = useMemo(
    () => computeEffectiveCanvasScale(zoomMode, fitScale),
    [fitScale, zoomMode],
  )

  const stageSize = useMemo(
    () =>
      computeCanvasStageSize(renderContext.width, renderContext.height, effectiveScale),
    [effectiveScale, renderContext.height, renderContext.width],
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

  // Issue #155: a pinch zoom step calls `setZoomMode`, which changes
  // `effectiveScale`/`stageSize`/`viewportLayout` asynchronously. This runs
  // *after* that new layout has actually committed to the DOM (useLayoutEffect,
  // pre-paint) and nudges the scroll position so the canvas point that was
  // under the gesture's midpoint before the step is still under it after —
  // a `setZoomMode` call with no pending anchor (the toolbar buttons, or the
  // initial mount) leaves scroll untouched.
  //
  // Depends on `zoomAnchorTick`, not `effectiveScale`/`viewportLayout`
  // (review finding m1): those two can end up numerically/referentially
  // unchanged even though `zoomMode` genuinely changed (`fit`'s computed
  // scale can coincide with an explicit level's), in which case this effect
  // would never re-run and the anchor set for THIS step would strand and
  // later misapply to some unrelated scale change. `setZoomAnchorTick` is
  // only ever called in the same synchronous update as the `setZoomMode`
  // that set this anchor, so both land in one React commit — this effect
  // always runs against the already-painted result of that same step.
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    if (!anchor) {
      return
    }
    pendingZoomAnchorRef.current = null
    const container = containerRef.current
    const paper = container?.querySelector<HTMLElement>('[data-canvas-paper]')
    if (!container || !paper) {
      return
    }
    const rect = paper.getBoundingClientRect()
    const anchoredClientX = rect.left + (anchor.canvasPoint.x / renderContext.width) * rect.width
    const anchoredClientY = rect.top + (anchor.canvasPoint.y / renderContext.height) * rect.height
    container.scrollLeft += anchoredClientX - anchor.clientX
    container.scrollTop += anchoredClientY - anchor.clientY
  }, [zoomAnchorTick, renderContext.height, renderContext.width])

  const fontAssetKeys = useStableAssetKeys(elements, collectFontKeysFromElements)

  // resolveElementHitBounds re-invokes safeRenderElement, so its result
  // depends on the core opentype.js font registry AND the core image
  // (dlimg) availability registry — both module-level Maps outside React
  // state — same as CanvasElementSlot's render memo and
  // assetAndRenderStatusMessages below. fontLoadOutcomes/imageLoadOutcomes
  // must stay dependencies even though the callback body doesn't reference
  // them directly: without them, a font/image settling to missing/failed
  // left hit-testing and the selection frame computing bounds against the
  // STALE pre-error render (maintainer manual-test finding — the blue
  // selection frame stayed at the element's real position while the marker
  // jumped elsewhere, and errored elements couldn't be dragged because
  // clicking the visible marker missed the stale hit-test region entirely).
  //
  // Derived from `baseElements`, so a drag freezes them for the whole gesture
  // (issue #124): re-resolving all bounds per pointermove re-invoked
  // safeRenderElement for every element — the bulk of the opentype
  // glyph-shaping cost in the drag profile — to produce hit targets nothing
  // reads mid-gesture. The drag is bound to the element grabbed at
  // pointerdown (whose starts come from the live targets, resolved before this
  // freeze commits), and the hover branch that reads them is skipped while a
  // session is in flight.
  const hitTargets = useMemo(() => {
    void fontLayoutTokenForKeys(fontAssetKeys, opentypeFonts)
    return baseElements.flatMap((element, index) => {
      if (!isElementCanvasSelectable(element, renderContext)) {
        return []
      }
      const bounds = resolveElementHitBounds(element, renderContext)
      return bounds ? [{ index, bounds }] : []
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [baseElements, fontAssetKeys, renderContext, opentypeFonts, fontLoadOutcomes, imageLoadOutcomes])

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

  const dlimgAssetKeys = useStableAssetKeys(elements, collectDlimgAssetKeysFromElements)

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
  // result depends on the core opentype.js font registry AND the core image
  // availability registry (both module-level Maps outside React state).
  // opentypeFonts/fontLoadOutcomes/imageLoadOutcomes are the only
  // React-visible signals those registries changed, so they must stay as
  // dependencies below even though the callback body doesn't reference them
  // directly — otherwise a font/image that finishes loading (or is confirmed
  // missing/failed) asynchronously, with no corresponding `elements` change,
  // would leave a stale banner even though the canvas placeholder already
  // updated. One failure = one banner (maintainer ruling): this also merges
  // a font/image-unavailable render-error banner with its asset-status
  // banner instead of showing both — see font-render-status.ts.
  const assetAndRenderStatusMessages = useMemo(
    () =>
      getMergedStatusMessages(elements, renderContext, fontLoadOutcomes, fontsLoading, imageLoadOutcomes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [elements, renderContext, fontLoadOutcomes, fontsLoading, opentypeFonts, imageLoadOutcomes],
  )

  const statusMessages = useMemo(
    () => sortStatusMessages([...extraStatusMessages, ...assetAndRenderStatusMessages]),
    [extraStatusMessages, assetAndRenderStatusMessages],
  )

  useEffect(() => {
    let cancelled = false

    // Pass `cancelled` down as loadAssetImageMapWithOutcomes's staleness
    // predicate too, not just for the setState guards below: without this,
    // an OLD (superseded) batch's in-flight loadAssetImage calls could still
    // write markImageUnavailable/clearImageUnavailable into the core
    // image-availability registry after a NEWER batch had already written
    // its own, correct determination for the same key — a stale write
    // silently clobbering a fresh one (independent review finding on
    // PR #58; reachable via rapid element edits that change which dlimg
    // URLs are in flight, mid-load).
    void loadAssetImageMapWithOutcomes(dlimgAssetKeys, () => cancelled).then((batch) => {
      if (!cancelled) {
        setAssetImages((current) =>
          areAssetImageMapsEqual(current, batch.images) ? current : batch.images,
        )
        setImageLoadOutcomes((current) =>
          areImageLoadOutcomeMapsEqual(current, batch.outcomes) ? current : batch.outcomes,
        )
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

  // See hitTargets above for why fontLoadOutcomes/imageLoadOutcomes must
  // stay dependencies even though they're not read in the body —
  // resolveElementHitBounds's result depends on them via the core font and
  // image availability registries.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [
    elements,
    fontAssetKeys,
    opentypeFonts,
    renderContext,
    selectedIndices,
    fontLoadOutcomes,
    imageLoadOutcomes,
  ])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see hitTargets above
  }, [
    fontAssetKeys,
    isMultiSelect,
    opentypeFonts,
    overlayElementForSelection,
    renderContext,
    selectionBoundsByIndex,
    fontLoadOutcomes,
    imageLoadOutcomes,
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
      )
      if (allowOutside) {
        return raw
      }
      return refineCanvasPointerPoint(raw, renderContext.width, renderContext.height)
    },
    [renderContext.height, renderContext.width],
  )

  const releaseCapturedPointer = useCallback((target: HTMLElement | null, pointerId: number) => {
    if (target?.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }, [])

  /**
   * Rebuilds an arbitrary prior selection via the existing single-index
   * `onSelectElement` mechanism (review finding M1, round 5) — there is no
   * "set selection to this exact array" prop, so a multi-selection is
   * replayed as one non-additive select followed by additive toggles, each
   * toggle adding (never removing) since none of the later indices are in
   * the accumulating set yet. An empty array means "was already
   * deselected", which `onSelectElement(null)` also expresses (and is a
   * no-op if selection is already empty).
   */
  const restoreSelection = useCallback(
    (indices: readonly number[]) => {
      if (indices.length === 0) {
        onSelectElement(null)
        return
      }
      onSelectElement(indices[0]!)
      for (let i = 1; i < indices.length; i++) {
        onSelectElement(indices[i]!, { additive: true })
      }
    },
    [onSelectElement],
  )

  /**
   * The single exit for a marquee session, parameterized by `cancel`
   * (review finding M1/M2, issue #149 follow-up) rather than a second
   * function — a second finger landing mid-marquee (`maybeStartTwoFingerSession`
   * below) must produce a TRUE cancel: selection left exactly as it was
   * before the marquee started, `onSelectAllInRect` never called at all
   * (not even the empty-marquee "deselect" fallback — that fallback is part
   * of *committing* an empty drag as a click-to-deselect, not part of
   * aborting one). A plain pointerup/lost-capture still commits as before.
   *
   * Round 5 (M1 second half): the non-additive pointerdown branches that
   * start a marquee call `onSelectElement(null)` *before* the session even
   * begins — outside this session's lifecycle entirely, so the cancel path
   * above couldn't undo it (measured: selecting an element, then a 2-finger
   * pan starting on empty canvas or the padding, cleared the selection).
   * `session.previousSelection` (captured at `beginMarqueeSession`, before
   * that deselect) makes the cancel path's restore cover the ENTIRE
   * marquee-adjacent selection change, not just the parts the session
   * itself owns — the deselect-before-marquee behavior for mouse and the
   * live marquee rect feedback are both unchanged; only the cancel path
   * now restores what the deselect touched.
   *
   * m4: releases pointer capture itself (matching `finishDrag`'s
   * self-contained pattern) instead of relying on the caller to do it
   * first — `maybeStartTwoFingerSession`'s cancel path had no such caller,
   * leaving the marquee's pointer captured on the container after an abort.
   */
  const finishMarquee = useCallback(
    (options?: { cancel?: boolean }) => {
      const session = marqueeSessionRef.current
      marqueeSessionRef.current = null
      setMarqueeSession(null)
      const rect = marqueeRectRef.current
      marqueeRectRef.current = null
      setMarqueeRect(null)
      if (session) {
        releaseCapturedPointer(pointerCaptureTargetRef.current, session.pointerId)
      }
      pointerCaptureTargetRef.current = null
      if (!session) {
        return
      }
      if (options?.cancel) {
        restoreSelection(session.previousSelection)
        return
      }
      if (rect && (rect.width >= 2 || rect.height >= 2)) {
        onSelectAllInRect(rect, session.additive)
        return
      }
      if (!session.additive) {
        onSelectElement(null)
      }
    },
    [onSelectAllInRect, onSelectElement, releaseCapturedPointer, restoreSelection],
  )

  /**
   * The single exit for a drag/resize session, parameterized by `cancel`
   * (review finding M1/M2) rather than a second function — a second finger
   * landing mid-drag must produce a TRUE cancel: the element(s) restored to
   * their pre-gesture state and NO undo entry written, not "frozen at its
   * partial position with one permanent undo entry" (the reviewer's
   * measured pre-fix behavior). `onCancelEditCoalesce` (vs. the commit
   * path's `onEndEditCoalesce`) is exactly `EditHistory.cancelCoalesce()`
   * plus restoring the coalesce-start snapshot (`useProjectState.ts`) — the
   * full elements array, not a reconstruction from this session's own
   * `starts`, so it can't drift from whatever else the coalesce covered.
   *
   * ADR-009: still exactly one `onDragActiveChange(false)` call and exactly
   * one coalesce-closing call (cancel XOR end, never both) — ending the
   * suspension of the elements→editor sync in the cancel case syncs the
   * now-restored elements, the same single drag-end sync path as a commit.
   */
  const finishDrag = useCallback(
    (options?: { cancel?: boolean }) => {
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
      if (options?.cancel) {
        onCancelEditCoalesce?.()
      } else {
        onEndEditCoalesce?.()
      }
    },
    [onCancelEditCoalesce, onDragActiveChange, onEndEditCoalesce, releaseCapturedPointer],
  )

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
      previousSelection: readonly number[],
    ) => {
      // A genuine new 1-finger gesture is not a pinch respawn (round 7).
      pinchContinuityRef.current = null
      target.setPointerCapture(pointerId)
      pointerCaptureTargetRef.current = target
      marqueeSessionRef.current = {
        pointerId,
        startCanvas,
        additive,
        previousSelection,
      }
      setMarqueeSession(marqueeSessionRef.current)
    },
    [],
  )

  const beginDragSession = useCallback(
    (session: DragSession) => {
      // A genuine new 1-finger gesture is not a pinch respawn (round 7).
      pinchContinuityRef.current = null
      onBeginEditCoalesce?.()
      setFrozenElements(elements)
      dragSessionRef.current = session
      setDragSession(session)
      onDragActiveChange?.(true)
    },
    [elements, onBeginEditCoalesce, onDragActiveChange],
  )

  const finishTwoFingerSession = useCallback(() => {
    const session = twoFingerSessionRef.current
    twoFingerSessionRef.current = null
    if (!session) {
      return
    }
    // Issue #149 follow-up (round 7): stash in case this end is a
    // digitizer-level touch respawn mid-pinch, not a real gesture end — see
    // `pinchContinuityRef`'s doc comment.
    pinchContinuityRef.current = {
      endedAt: performance.now(),
      referenceDistance: session.referenceDistance,
    }
    const target = twoFingerCaptureTargetRef.current
    twoFingerCaptureTargetRef.current = null
    for (const id of session.ids) {
      if (target?.hasPointerCapture(id)) {
        target.releasePointerCapture(id)
      }
    }
  }, [])

  /**
   * Issue #149 follow-up (review M1/M2) / #155: the exact instant
   * `activePointersRef` reaches two entries, start navigation — TRUE
   * CANCELING (never committing, never blending with) any in-flight
   * 1-finger gesture first: escalating to navigation aborts the intent, it
   * doesn't finish it. A marquee never calls `onSelectAllInRect`, leaving
   * selection exactly as it was; a drag/resize restores the pre-gesture
   * elements and writes no undo entry (see `finishMarquee`/`finishDrag`'s
   * `cancel` option). A 3rd+ finger touching down while a session is
   * already active is a no-op here: it's still tracked in
   * `activePointersRef`, but the session keeps riding its original two ids.
   */
  const maybeStartTwoFingerSession = useCallback(
    (target: HTMLElement) => {
      if (twoFingerSessionRef.current || activePointersRef.current.size !== 2) {
        return
      }
      if (dragSessionRef.current) {
        finishDrag({ cancel: true })
      }
      if (marqueeSessionRef.current) {
        finishMarquee({ cancel: true })
      }
      const [idA, idB] = [...activePointersRef.current.keys()] as [number, number]
      const a = activePointersRef.current.get(idA)
      const b = activePointersRef.current.get(idB)
      if (!a || !b) {
        return
      }
      target.setPointerCapture(idA)
      target.setPointerCapture(idB)
      twoFingerCaptureTargetRef.current = target

      // Issue #149 follow-up (round 7): a digitizer-level touch respawn
      // (previous 2-finger session just ended, a new one starting within
      // PINCH_CONTINUITY_WINDOW_MS) inherits the OLD referenceDistance
      // instead of measuring a fresh one at the current spread — otherwise
      // the pinch's accumulated spread since the gesture truly began is
      // lost every time the hardware respawns a touch mid-gesture. Cleared
      // unconditionally below: a stash consumed here, or one that's gone
      // stale, is equally irrelevant to this (now current) session.
      const stash = pinchContinuityRef.current
      const inheritedReferenceDistance =
        stash && performance.now() - stash.endedAt < PINCH_CONTINUITY_WINDOW_MS
          ? stash.referenceDistance
          : null
      pinchContinuityRef.current = null

      twoFingerSessionRef.current = {
        ids: [idA, idB],
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        referenceDistance: inheritedReferenceDistance ?? Math.hypot(b.x - a.x, b.y - a.y),
      }
    },
    [finishDrag, finishMarquee],
  )

  /**
   * Issue #149 follow-up (round 6, maintainer real-hardware report):
   * registers every touch pointer, and evaluates a 2-finger session start,
   * in the CAPTURE phase directly on the container — before React's own
   * bubble-phase `onPointerDown` (`handlePointerDown` below) even runs, and
   * before any future descendant handler could `stopPropagation()` a
   * second finger's pointerdown away from ever reaching this component.
   * Not a duplicate of `handlePointerDown`'s own registration: that one
   * still runs too and still owns every 1-finger decision (hit-testing,
   * selection, drag/resize/marquee start) — calling this twice for the
   * same pointer is idempotent (`Map.set` on the same key;
   * `maybeStartTwoFingerSession`'s own `twoFingerSessionRef.current` guard
   * makes a repeat call a no-op). Nothing here runs for mouse/pen.
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const handleCapturePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        return
      }
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!event.isPrimary) {
        maybeStartTwoFingerSession(container)
      }
    }
    container.addEventListener('pointerdown', handleCapturePointerDown, { capture: true })
    return () => {
      container.removeEventListener('pointerdown', handleCapturePointerDown, { capture: true })
    }
  }, [maybeStartTwoFingerSession])

  /**
   * Issue #149 follow-up (round 6, maintainer real-hardware report): the
   * `touch-action: none` below is a CSS *pan*-blocking signal — on some
   * mobile browser engines it does not also block the browser's own
   * native pinch-to-zoom-the-page gesture, which several engines instead
   * gate on the viewport meta tag (`index.html` deliberately carries no
   * `user-scalable=no`/`maximum-scale` — maintainer ruling: page pinch-zoom
   * stays available as an accessibility affordance everywhere OUTSIDE the
   * canvas, e.g. the sidebar/panels/YAML editor). A native gesture
   * recognizer that claims a 2nd touch for its own page-zoom can starve it
   * from ever reaching pointer-event registration, which matches the
   * reported hardware failure (a "2-finger pan" mostly behaving like an
   * uninterrupted 1-finger drag/marquee, and a pinch that also drags along
   * whatever element the first finger landed on) despite CDP-emulated
   * tests passing — CDP's synthetic touch input does not appear to route
   * through this native competition at all (an emulation gap, not a false
   * negative in the specs below). A non-passive native `touchstart`/
   * `touchmove` listener scoped to this container, calling
   * `preventDefault()` whenever more than one touch is active, blocks that
   * native gesture at the source without touching `index.html` or any
   * other part of the page — scoped exactly to the canvas viewport, same
   * as `touch-action: none`.
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const preventNativeMultiTouchGesture = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    }
    container.addEventListener('touchstart', preventNativeMultiTouchGesture, { passive: false })
    container.addEventListener('touchmove', preventNativeMultiTouchGesture, { passive: false })
    return () => {
      container.removeEventListener('touchstart', preventNativeMultiTouchGesture)
      container.removeEventListener('touchmove', preventNativeMultiTouchGesture)
    }
  }, [])

  /**
   * Issue #155: pan follows the 2-finger midpoint every move; pinch zoom
   * steps the existing discrete `zoomMode` (never a continuous value — see
   * {@link PINCH_ZOOM_STEP_ORDER}) when the two touches' distance has
   * spread or closed by {@link PINCH_ZOOM_STEP_RATIO} since the last step
   * (a ratchet — see that constant's doc for why one continuous pinch can
   * fire several steps), anchored via `pendingZoomAnchorRef` (consumed by
   * the layout effect above, bumping `zoomAnchorTick` so that effect is
   * guaranteed to run even when the resulting scale happens to be
   * numerically unchanged — review finding m1) so the canvas point under
   * the gesture midpoint doesn't jump.
   */
  const updateTwoFingerGesture = useCallback(
    (session: TwoFingerSession) => {
      const container = containerRef.current
      const a = activePointersRef.current.get(session.ids[0])
      const b = activePointersRef.current.get(session.ids[1])
      if (!container || !a || !b) {
        return
      }
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const distance = Math.hypot(b.x - a.x, b.y - a.y)

      const dx = midpoint.x - session.midpoint.x
      const dy = midpoint.y - session.midpoint.y
      if (dx !== 0 || dy !== 0) {
        container.scrollLeft -= dx
        container.scrollTop -= dy
      }

      const ratio = distance / session.referenceDistance
      let nextReferenceDistance = session.referenceDistance
      if (ratio >= PINCH_ZOOM_STEP_RATIO || ratio <= 1 / PINCH_ZOOM_STEP_RATIO) {
        const nextMode = nextZoomModeForPinch(
          zoomMode,
          ratio >= PINCH_ZOOM_STEP_RATIO ? 'increase' : 'decrease',
          fitScale,
        )
        if (nextMode !== zoomMode) {
          const anchorCanvasPoint = mapClientToCanvas(midpoint.x, midpoint.y, true)
          if (anchorCanvasPoint) {
            pendingZoomAnchorRef.current = {
              canvasPoint: anchorCanvasPoint,
              clientX: midpoint.x,
              clientY: midpoint.y,
            }
            setZoomAnchorTick((tick) => tick + 1)
          }
          setZoomMode(nextMode)
        }
        nextReferenceDistance = distance
      }

      twoFingerSessionRef.current = {
        ids: session.ids,
        midpoint,
        referenceDistance: nextReferenceDistance,
      }
    },
    [fitScale, mapClientToCanvas, zoomMode],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activePointersRef.current.has(event.pointerId)) {
        activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      }

      // Issue #155: a pointer belonging to an active 2-finger nav session is
      // never an element gesture — short-circuit before any hit-testing,
      // hover-cursor, or drag/marquee logic below even runs.
      const twoFinger = twoFingerSessionRef.current
      if (twoFinger && (event.pointerId === twoFinger.ids[0] || event.pointerId === twoFinger.ids[1])) {
        event.preventDefault()
        updateTwoFingerGesture(twoFinger)
        return
      }

      const dragging = dragSessionRef.current != null
      const marqueing = marqueeSessionRef.current != null
      const point = mapClientToCanvas(event.clientX, event.clientY, dragging || marqueing)
      setPointer(point)

      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId && point) {
        // Issue #149: unlike the drag/resize branch below, this path used to
        // fall through to the early `return` further down without ever
        // calling `preventDefault()` — a real, deterministic gap (not a
        // browser-timing race) that let a touch marquee-drag be claimed as a
        // viewport scroll even where `touch-action` doesn't already rule it
        // out. Keep both fixes: this call is the belt, the paper's
        // `touch-action: none` is the suspenders.
        event.preventDefault()
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
      updateTwoFingerGesture,
    ],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(event.pointerId)

      const twoFinger = twoFingerSessionRef.current
      if (twoFinger && (event.pointerId === twoFinger.ids[0] || event.pointerId === twoFinger.ids[1])) {
        finishTwoFingerSession()
        return
      }

      // finishDrag/finishMarquee release capture themselves (m4) — no need
      // to also release it here first.
      const session = dragSessionRef.current
      if (session && event.pointerId === session.pointerId) {
        finishDrag()
      }
      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId) {
        finishMarquee()
      }
    },
    [finishDrag, finishMarquee, finishTwoFingerSession],
  )

  const handleLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(event.pointerId)

      const twoFinger = twoFingerSessionRef.current
      if (twoFinger && (event.pointerId === twoFinger.ids[0] || event.pointerId === twoFinger.ids[1])) {
        finishTwoFingerSession()
        return
      }

      const session = dragSessionRef.current
      if (session && event.pointerId === session.pointerId) {
        finishDrag()
      }
      const marquee = marqueeSessionRef.current
      if (marquee && event.pointerId === marquee.pointerId) {
        finishMarquee()
      }
    },
    [finishDrag, finishMarquee, finishTwoFingerSession],
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

      // Issue #149 follow-up / #155: multi-pointer tracking and the whole
      // 1-finger-is-intent / 2-finger-is-navigation split are a *touch*
      // concern — scoped to `pointerType === 'touch'` so mouse (and pen)
      // input, including every existing jsdom test that fires a bare
      // `PointerEvent`/`fireEvent.pointerDown` with no `pointerType` (which
      // defaults to `''`, not `'mouse'`, and always `isPrimary: false` per
      // the DOM spec's init-dict default — nothing like a real single-mouse
      // pointerdown), is completely unaffected.
      if (event.pointerType === 'touch') {
        activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

        if (!event.isPrimary) {
          // Every finger used to fire pointerdown into the hit-testing/
          // selection logic below, so a second finger landing during a drag
          // would select and start dragging whatever was underneath it. A
          // non-primary touch never hit-tests, never selects, and never
          // starts a drag/resize/marquee session — its only possible effect
          // is (once there are exactly two active touches) starting
          // 2-finger navigation (#155), which itself cancels any 1-finger
          // session already in flight rather than fighting it.
          maybeStartTwoFingerSession(event.currentTarget)
          return
        }
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
        // `selectedIndices` here is the pre-deselect value even when a
        // branch below already called `onSelectElement(null)` first — that
        // call only queues a React state update; this closure still reads
        // the value from the render that created it (review finding M1,
        // round 5: the deselect fires outside the marquee session, so
        // finishMarquee's cancel path needs its own record to undo it).
        beginMarqueeSession(event.currentTarget, event.pointerId, canvasPoint, additive, selectedIndices)
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

        // Shift-touching an already-selected element removes it — no drag
        // starts, so ordering relative to a coalesce snapshot never matters
        // here; keep this the original early return.
        if (additive && wasSelected) {
          onSelectElement(topHit.index, { additive: true })
          return
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
        // Issue #149 follow-up (round 6, maintainer real-hardware report):
        // begin the drag session — and, via `onBeginEditCoalesce`, the
        // snapshot a cancel restores from — BEFORE the selection change
        // below, not after. `selectedIndicesRef` updates synchronously
        // inside `onSelectElement`, so capturing the coalesce snapshot
        // *after* calling it (the original order) meant a drag started by
        // touching a previously-unselected element captured a snapshot that
        // *already* had that element selected — cancelling then correctly
        // reverted position but left the element selected. Measured on real
        // hardware: a pinch-zoom starting with one finger on an unselected
        // element "always" ended with that element selected.
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

        if (additive) {
          onSelectElement(topHit.index, { additive: true })
        } else if (!wasSelected) {
          onSelectElement(topHit.index)
        } else {
          onSelectedElementPointerDown?.(topHit.index)
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
      maybeStartTwoFingerSession,
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
      // Scope to this instance's root (issue #21): standalone this is the
      // document (matches every event), embedded it is the mount's shadow
      // root — host-page keystrokes and other instances stay ignored.
      const scopeRoot = containerRef.current?.getRootNode()
      if (!shouldHandleCanvasKeyboard(event, scopeRoot)) {
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

  /**
   * The designer's own rasterization of the current design, full font/render
   * fidelity, independent of Display preview — this is what "Copy/Download
   * PNG" produce outside preview mode, and it is also what backs
   * `MountHandle.getPngBlob()` (issue #109 review, maintainer-ruled demo
   * fix): a host with no rendering backend of its own reads this instead of
   * writing a second renderer. Deliberately does not consult
   * `previewActive`/`displayPreview` — a `renderPreview` provider built on
   * top of `getPngBlob()` must never be able to call back into itself.
   */
  const renderCurrentDesignPngBlob = useCallback((): Promise<Blob> => {
    return renderPayloadToPngBlob({
      elements: baseElements,
      renderContext: {
        ...renderContext,
        showHiddenHints: false,
      },
      assetImages: displayAssetImages,
      fontFamilies,
      opentypeFonts,
    })
  }, [baseElements, displayAssetImages, fontFamilies, opentypeFonts, renderContext])

  usePublishedCallback(pngBlobSourceRef, renderCurrentDesignPngBlob)

  const exportPreviewPng = useCallback(async (): Promise<Blob | null> => {
    // Copy/Download PNG stay live in preview mode and act on what is on screen
    // (maintainer ruling): the host's render, never a client rasterization
    // silently substituted for it.
    if (previewActive && displayPreview) {
      return displayPreview.getImageBlob()
    }
    return renderCurrentDesignPngBlob()
  }, [displayPreview, previewActive, renderCurrentDesignPngBlob])

  const handleCopyPng = useCallback(async () => {
    try {
      const blob = await exportPreviewPng()
      if (!blob) {
        flashError('copy-png', DISPLAY_PREVIEW_NOT_READY_MESSAGE)
        return
      }
      const copied = await copyBlobToClipboard(blob)
      if (copied.ok) {
        flashSuccess('copy-png')
      } else {
        flashError('copy-png', copied.reason)
      }
    } catch {
      flashError('copy-png', 'PNG export failed')
    }
  }, [exportPreviewPng, flashError, flashSuccess])

  const handleDownloadPng = useCallback(async () => {
    try {
      const blob = await exportPreviewPng()
      if (!blob) {
        flashError('download-png', DISPLAY_PREVIEW_NOT_READY_MESSAGE)
        return
      }
      triggerBlobDownload(
        blob,
        // The host's render is a different image of the same session — name it
        // so it can sit next to the designer's own export and be diffed
        // (issue #109 review ruling), not overwrite it.
        previewActive
          ? buildDisplayPreviewPngDownloadFilename(sessionName)
          : buildPngDownloadFilename(sessionName),
      )
      flashSuccess('download-png')
    } catch {
      flashError('download-png', 'PNG export failed')
    }
  }, [exportPreviewPng, flashError, flashSuccess, previewActive, sessionName])

  const toolbarProps = {
    showLabels: showCanvasLabels,
    zoomMode,
    onZoomModeChange: setZoomMode,
    getFeedback,
    getFeedbackMessage,
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
        <div
          ref={titleRef}
          data-testid="canvas-heading"
          className="flex min-w-0 shrink-0 items-center gap-2"
        >
          <h2 className={`${shell.heading} shrink-0`}>Canvas</h2>
          {/* Conditional chrome (issue #109): the toggle exists only where a
              host registered a preview provider — standalone renders no control
              here at all. Always labelled: it switches the canvas into another
              mode, so it must not collapse into an unexplained icon.

              Disabled-with-a-stated-reason while the YAML document is broken
              (maintainer ruling 2026-08-17), the same pattern the host action
              buttons use: entering would render the last-valid payload, an image
              of something other than what the editor shows. The hover bubble is
              the sighted reader's channel (a disabled button takes no pointer
              events); the sr-only description is what assistive tech gets. */}
          {displayPreview?.available ? (
            <ToolbarTooltip label={previewDisabledReason ?? undefined} placement="below">
              <FeatureToggle
                enabled={previewActive}
                onToggle={displayPreview.toggle}
                textLabel="Display preview"
                detailedTitle={
                  previewDisabledReason ??
                  "Show the display's own render of this design instead of the designer preview (editing is paused)"
                }
                disabled={previewDisabledReason != null}
                aria-describedby={previewDisabledReason != null ? previewReasonId : undefined}
                data-testid="display-preview-toggle"
              >
                <span className="flex items-center gap-1">
                  <MdiIcon path={TOOL_ICONS.displayPreview} size={16} className="shrink-0" />
                  <span>Display preview</span>
                </span>
              </FeatureToggle>
              {previewDisabledReason != null ? (
                <span id={previewReasonId} className="sr-only">
                  {previewDisabledReason}
                </span>
              ) : null}
            </ToolbarTooltip>
          ) : null}
        </div>
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
        {/* Selection chrome has nothing to act on over a host render, so it is
            not rendered at all rather than floating there disabled. */}
        {previewActive ? null : (
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
        )}
        {displayPreview && previewActive ? (
          <DisplayPreviewStatus loading={displayPreview.loading} error={displayPreview.error} />
        ) : null}
        {pointer && !previewActive ? (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-md bg-[var(--shell-text)]/75 px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--shell-surface)] shadow-sm"
            aria-hidden
          >
            {formatCanvasPointerCoords(pointer, renderContext.width, renderContext.height)}
          </div>
        ) : null}
        {/* Never over a host render (maintainer ruling 2026-08-17): preview mode
            is not an error state, and entering one is refused while the document
            is broken — so this can only ever explain the designer's own canvas.
            The `!previewActive` guard makes that structural rather than merely
            true today. */}
        {blockedVisible && !previewActive ? (
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
          style={
            {
              cursor: dragSession ? 'grabbing' : hoverCursor,
              // Issue #149 follow-up (maintainer tablet report, settled
              // gesture split): 1-finger touch is always element intent
              // (drag, resize, marquee) on BOTH the paper and this scroll
              // padding — a paper-only `touch-action: none` left the padding
              // (the maintainer's primary marquee-start spot, since a
              // full-canvas element like the showcase demo's debug_grid
              // leaves no empty paper to start a marquee from) just as
              // contested as before #149's fix, and dead both ways: the
              // browser could still claim it for panning, but our own
              // `preventDefault()` calls usually won that race anyway,
              // leaving neither a marquee nor a pan. `touch-action` is
              // evaluated by the browser before any JS runs, so this is the
              // actual fix, not a belt-and-suspenders addition. All touch
              // panning/zooming of this viewport is now a dedicated 2-finger
              // gesture (issue #155) — never a side effect of 1-finger
              // scrolling. Scoped to this viewport only: it must never leak
              // into the sidebar/properties panel or the YAML editor, which
              // keep normal touch scrolling.
              touchAction: 'none',
            } satisfies CSSProperties
          }
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
                  transform: paperTransform(effectiveScale),
                  transformOrigin: 'top left',
                } satisfies CSSProperties
              }
            >
          {/* Preview mode replaces the paper's *content*, not the paper: the
              host render inherits the whole zoom/scroll system (issue #109),
              and every edit affordance below is simply not mounted. */}
          {previewActive ? (
            displayPreview?.imageUrl ? (
              <DisplayPreviewImage
                url={displayPreview.imageUrl}
                width={renderContext.width}
                height={renderContext.height}
              />
            ) : null
          ) : (
          <>
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
              imageLoadOutcomes={imageLoadOutcomes}
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
              imageLoadOutcomes={imageLoadOutcomes}
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
          </>
          )}
            </div>
          </div>
        </div>
        ) : null}
        </div>
      </div>
    </section>
  )
}
