import type { ElementBounds } from './primitive-bounds'
import type { ResizeHandle } from './element-geometry'

export const HANDLE_VISUAL_SIZE = 8
/** Pointer hit slop — larger than the drawn handle so corners are easy to grab. */
export const HANDLE_HIT_RADIUS = 12

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
  for (const handle of handles) {
    const pos = handlePosition(bounds, handle, lineCoords)
    if (
      point.x >= pos.x - hitRadius &&
      point.x <= pos.x + hitRadius &&
      point.y >= pos.y - hitRadius &&
      point.y <= pos.y + hitRadius
    ) {
      return handle
    }
  }
  return null
}
