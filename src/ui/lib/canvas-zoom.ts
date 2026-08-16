import type { CanvasZoomMode } from '../preferences/canvasZoom'

/**
 * Canvas viewport math for a canvas that is **always presented upright**
 * (issue #139).
 *
 * The canvas config's width/height *are* the logical drawing surface —
 * already swapped for a quarter turn, exactly as upstream `imagegen` creates
 * its Pillow canvas. Rotation chooses that surface's orientation and nothing
 * here ever turns the presentation: no rotated stage envelope, no CSS
 * quarter-turn on the paper, no inverse-rotation of pointer coordinates.
 * Everything below is therefore rotation-free by construction.
 */

/** Padding inside the scroll viewport (`p-6` × 2). */
export const CANVAS_VIEWPORT_PADDING_PX = 48

export interface ViewportSize {
  width: number
  height: number
}

export interface CanvasViewportLayout {
  /** Inner scroll content width (includes padding box). */
  scrollContentWidth: number
  /** Inner scroll content height (includes padding box). */
  scrollContentHeight: number
  centerX: boolean
  centerY: boolean
  needsScrollX: boolean
  needsScrollY: boolean
}

export function computeAvailableStageArea(
  viewportSize: ViewportSize,
  padding = CANVAS_VIEWPORT_PADDING_PX,
): ViewportSize {
  return {
    width: Math.max(0, viewportSize.width - padding),
    height: Math.max(0, viewportSize.height - padding),
  }
}

/**
 * Fit scale from the scrollport client size (space above the YAML divider).
 * Scales down or up so the canvas fills the available area.
 */
export function computeFitScale(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = CANVAS_VIEWPORT_PADDING_PX,
): number {
  const available = computeAvailableStageArea(
    { width: viewportWidth, height: viewportHeight },
    padding,
  )
  if (available.width <= 0 || available.height <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return 1
  }
  return Math.min(available.width / canvasWidth, available.height / canvasHeight)
}

export function computeEffectiveCanvasScale(mode: CanvasZoomMode, fitScale: number): number {
  switch (mode) {
    case 'fit':
      return fitScale
    case '100':
      return 1
    case '200':
      return 2
    case '50':
      return 0.5
    default: {
      const _exhaustive: never = mode
      return _exhaustive
    }
  }
}

/** Pixel size of the visible stage: the canvas at uniform scale. */
export function computeCanvasStageSize(
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
): ViewportSize {
  return {
    width: canvasWidth * scale,
    height: canvasHeight * scale,
  }
}

/**
 * Fit mode: expand scroll content to the viewport and center the stage.
 * Overflow mode: size to the stage and anchor top-left so scrolling works.
 */
export function computeCanvasViewportLayout(
  viewportSize: ViewportSize,
  stageSize: ViewportSize,
  padding = CANVAS_VIEWPORT_PADDING_PX,
): CanvasViewportLayout {
  const available = computeAvailableStageArea(viewportSize, padding)
  const centerX = stageSize.width <= available.width + 0.5
  const centerY = stageSize.height <= available.height + 0.5

  return {
    centerX,
    centerY,
    needsScrollX: !centerX,
    needsScrollY: !centerY,
    scrollContentWidth: centerX ? viewportSize.width : stageSize.width + padding,
    scrollContentHeight: centerY ? viewportSize.height : stageSize.height + padding,
  }
}

/** Client pixels → canvas coordinates: undo the paper's uniform scale, nothing else. */
export function clientPointToCanvasCoords(
  clientX: number,
  clientY: number,
  paperRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: ((clientX - paperRect.left) * canvasWidth) / paperRect.width,
    y: ((clientY - paperRect.top) * canvasHeight) / paperRect.height,
  }
}

/** Tolerance for pointer hits near the canvas border (sub-pixel / layout slack). */
export const CANVAS_POINTER_EDGE_EPSILON = 0.5

export function isPointInsideCanvas(
  point: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  epsilon = CANVAS_POINTER_EDGE_EPSILON,
): boolean {
  return (
    point.x >= -epsilon &&
    point.y >= -epsilon &&
    point.x <= canvasWidth + epsilon &&
    point.y <= canvasHeight + epsilon
  )
}

/** Clamp pointer coords to the canvas and snap near-edge floats to exact border pixels. */
export function refineCanvasPointerPoint(
  point: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  epsilon = CANVAS_POINTER_EDGE_EPSILON,
): { x: number; y: number } | null {
  if (!isPointInsideCanvas(point, canvasWidth, canvasHeight, epsilon)) {
    return null
  }
  return {
    x: snapCanvasPointerCoordinate(point.x, canvasWidth),
    y: snapCanvasPointerCoordinate(point.y, canvasHeight),
  }
}

function snapCanvasPointerCoordinate(value: number, max: number): number {
  const clamped = Math.min(max, Math.max(0, value))
  if (clamped <= CANVAS_POINTER_EDGE_EPSILON) {
    return 0
  }
  if (clamped >= max - CANVAS_POINTER_EDGE_EPSILON) {
    return max
  }
  return Math.round(clamped)
}

export function formatCanvasPointerCoords(
  point: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
): string {
  const refined = refineCanvasPointerPoint(point, canvasWidth, canvasHeight, Number.POSITIVE_INFINITY)
  if (!refined) {
    return `${Math.round(point.x)}, ${Math.round(point.y)}`
  }
  return `${refined.x}, ${refined.y}`
}

/** CSS transform for the paper: a uniform scale from its top-left corner. */
export function paperTransform(scale: number): string {
  return `scale(${scale})`
}
