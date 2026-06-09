import type { CanvasRotation } from '../hooks/useProjectState'
import type { CanvasZoomMode } from '../preferences/canvasZoom'

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

/** Logical canvas bounds after rotation (axis-aligned envelope). */
export function computeRotatedCanvasBounds(
  width: number,
  height: number,
  rotation: CanvasRotation,
): ViewportSize {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width }
  }
  return { width, height }
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
 * Scales down or up so the rotated canvas bounds fill the available area.
 */
export function computeFitScale(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  rotation: CanvasRotation,
  padding = CANVAS_VIEWPORT_PADDING_PX,
): number {
  const bounds = computeRotatedCanvasBounds(canvasWidth, canvasHeight, rotation)
  const available = computeAvailableStageArea(
    { width: viewportWidth, height: viewportHeight },
    padding,
  )
  if (available.width <= 0 || available.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return 1
  }
  return Math.min(available.width / bounds.width, available.height / bounds.height)
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

/** Pixel size of the visible stage after rotate + uniform scale. */
export function computeCanvasStageSize(
  canvasWidth: number,
  canvasHeight: number,
  rotation: CanvasRotation,
  scale: number,
): ViewportSize {
  const bounds = computeRotatedCanvasBounds(canvasWidth, canvasHeight, rotation)
  return {
    width: bounds.width * scale,
    height: bounds.height * scale,
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

export function clientPointToCanvasCoords(
  clientX: number,
  clientY: number,
  stageRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number,
  rotation: CanvasRotation,
): { x: number; y: number } {
  const bounds = computeRotatedCanvasBounds(canvasWidth, canvasHeight, rotation)
  const scaleX = stageRect.width / bounds.width
  const scaleY = stageRect.height / bounds.height
  const localX = (clientX - stageRect.left) / scaleX
  const localY = (clientY - stageRect.top) / scaleY

  switch (rotation) {
    case 0:
      return { x: localX, y: localY }
    case 90:
      return { x: localY, y: canvasHeight - localX }
    case 180:
      return { x: canvasWidth - localX, y: canvasHeight - localY }
    case 270:
      return { x: canvasWidth - localY, y: localX }
    default: {
      const _exhaustive: never = rotation
      return _exhaustive
    }
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

/** Map a canvas-space point to stage-local pixels (matches pointer hit-test inverse). */
export function mapCanvasPointToStageLocal(
  cx: number,
  cy: number,
  canvasWidth: number,
  canvasHeight: number,
  rotation: CanvasRotation,
  scale: number,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: cx * scale, y: cy * scale }
    case 90:
      return { x: (canvasHeight - cy) * scale, y: cx * scale }
    case 180:
      return { x: (canvasWidth - cx) * scale, y: (canvasHeight - cy) * scale }
    case 270:
      return { x: cy * scale, y: (canvasWidth - cx) * scale }
    default: {
      const _exhaustive: never = rotation
      return _exhaustive
    }
  }
}

/** CSS matrix for rotate+scale with top-left origin; keeps content inside the stage envelope. */
export function paperTransform(
  rotation: CanvasRotation,
  scale: number,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const w = canvasWidth
  const h = canvasHeight
  const s = scale

  switch (rotation) {
    case 0:
      return `matrix(${s}, 0, 0, ${s}, 0, 0)`
    case 90:
      return `matrix(0, ${s}, ${-s}, 0, ${h * s}, 0)`
    case 180:
      return `matrix(${-s}, 0, 0, ${-s}, ${w * s}, ${h * s})`
    case 270:
      return `matrix(0, ${-s}, ${s}, 0, 0, ${w * s})`
    default: {
      const _exhaustive: never = rotation
      return _exhaustive
    }
  }
}
