import type { ElementBounds } from './primitive-bounds'
import type { ResizeHandle } from './element-geometry'

export const HANDLE_VISUAL_SIZE = 8
/** Default pointer hit slop around the drawn handle (px, canvas coords). */
export const HANDLE_HIT_RADIUS = 8

const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  'line-start': 'crosshair',
  'line-end': 'crosshair',
}

/** Shrink handle hit zones on small elements so the interior stays easy to drag. */
export function effectiveHandleHitRadius(
  bounds: ElementBounds,
  maxRadius = HANDLE_HIT_RADIUS,
): number {
  const minDim = Math.min(bounds.width, bounds.height)
  if (!Number.isFinite(minDim) || minDim <= 0) {
    return maxRadius
  }
  return Math.max(3, Math.min(maxRadius, minDim * 0.22))
}

export function isInteriorMovePoint(
  point: { x: number; y: number },
  bounds: ElementBounds,
  edgeSlop?: number,
): boolean {
  const slop = edgeSlop ?? effectiveHandleHitRadius(bounds)
  if (bounds.width <= slop * 2 || bounds.height <= slop * 2) {
    return false
  }
  return (
    point.x >= bounds.x + slop &&
    point.x <= bounds.x + bounds.width - slop &&
    point.y >= bounds.y + slop &&
    point.y <= bounds.y + bounds.height - slop
  )
}

export function resizeHandleCursor(handle: ResizeHandle): string {
  return RESIZE_CURSOR[handle]
}

export function handlePosition(
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

export function hitResizeHandle(
  point: { x: number; y: number },
  bounds: ElementBounds,
  handles: readonly ResizeHandle[],
  lineCoords?: { x1: number; y1: number; x2: number; y2: number },
  hitRadius = HANDLE_HIT_RADIUS,
): ResizeHandle | null {
  const radius = effectiveHandleHitRadius(bounds, hitRadius)
  for (const handle of handles) {
    const pos = handlePosition(bounds, handle, lineCoords)
    if (
      point.x >= pos.x - radius &&
      point.x <= pos.x + radius &&
      point.y >= pos.y - radius &&
      point.y <= pos.y + radius
    ) {
      return handle
    }
  }
  return null
}

/** True when a resize handle hit should defer to move (interior / tiny targets). */
export function shouldPreferMoveOverResize(
  point: { x: number; y: number },
  bounds: ElementBounds,
  handle: ResizeHandle,
  lineCoords?: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  if (isInteriorMovePoint(point, bounds)) {
    return true
  }

  const minDim = Math.min(bounds.width, bounds.height)
  if (minDim >= 32) {
    return false
  }

  const pos = handlePosition(bounds, handle, lineCoords)
  const distance = Math.hypot(point.x - pos.x, point.y - pos.y)
  const tightRadius = Math.max(3, effectiveHandleHitRadius(bounds) * 0.7)
  return distance > tightRadius
}
