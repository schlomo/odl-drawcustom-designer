import { hasTemplateSyntax, type DrawElement } from '../../core'
import type { ElementBounds } from './primitive-bounds'

export type ResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'line-start'
  | 'line-end'

const PERCENT_COORD = /^\d+(\.\d+)?%$/

export interface TranslateCanvasDefaults {
  width: number
  height: number
}

/** Apply drag/nudge delta; materialize omitted numeric coords from `missingDefault` when delta ≠ 0. */
export function applyAxisDelta(
  value: number | string | undefined,
  delta: number,
  missingDefault?: number,
): number | string | undefined {
  if (isNumericCoordinate(value)) {
    return value + delta
  }
  if (value !== undefined) {
    return value
  }
  if (delta === 0 || missingDefault === undefined) {
    return undefined
  }
  return missingDefault + delta
}

function spreadAxisDelta(
  key: string,
  value: number | string | undefined,
  delta: number,
  missingDefault?: number,
): Record<string, number | string> {
  const next = applyAxisDelta(value, delta, missingDefault)
  return next !== undefined ? { [key]: next } : {}
}

export function isNumericCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isInteractiveCoordinate(value: unknown): boolean {
  if (isNumericCoordinate(value)) {
    return true
  }
  if (typeof value !== 'string') {
    return false
  }
  if (hasTemplateSyntax(value) || PERCENT_COORD.test(value)) {
    return false
  }
  return false
}

export function isElementDraggable(element: DrawElement): boolean {
  switch (element.type) {
    case 'debug_grid':
      return false
    case 'text':
      return isInteractiveCoordinate(element.x)
    case 'multiline':
      return isInteractiveCoordinate(element.x)
    case 'line':
      return (
        isInteractiveCoordinate(element.x_start) &&
        isInteractiveCoordinate(element.x_end) &&
        isInteractiveCoordinate(element.y_start ?? 0) &&
        isInteractiveCoordinate(element.y_end ?? 0)
      )
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
      return (
        isInteractiveCoordinate(element.x_start) &&
        isInteractiveCoordinate(element.x_end) &&
        isInteractiveCoordinate(element.y_start) &&
        isInteractiveCoordinate(element.y_end)
      )
    case 'rectangle_pattern':
      return isInteractiveCoordinate(element.x_start) && isInteractiveCoordinate(element.y_start)
    case 'polygon':
      return element.points.every(([x, y]) => isNumericCoordinate(x) && isNumericCoordinate(y))
    case 'circle':
    case 'arc':
      return isInteractiveCoordinate(element.x) && isInteractiveCoordinate(element.y)
    case 'icon':
    case 'icon_sequence':
      return isInteractiveCoordinate(element.x) && isInteractiveCoordinate(element.y)
    case 'dlimg':
      return isNumericCoordinate(element.x) && isNumericCoordinate(element.y)
    case 'qrcode':
      return isInteractiveCoordinate(element.x) && isInteractiveCoordinate(element.y)
    case 'plot':
      return (
        isNumericCoordinate(element.x_start ?? 0) &&
        isNumericCoordinate(element.y_start ?? 0) &&
        isNumericCoordinate(element.x_end ?? 0) &&
        isNumericCoordinate(element.y_end ?? 0)
      )
    default: {
      const _exhaustive: never = element
      return _exhaustive
    }
  }
}

export function supportsBoxResize(element: DrawElement): boolean {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
    case 'plot':
    case 'dlimg':
      return isElementDraggable(element)
    default:
      return false
  }
}

export function supportsLineEndpointResize(element: DrawElement): element is DrawElement & { type: 'line' } {
  return element.type === 'line' && isElementDraggable(element)
}

export function supportsRadiusResize(element: DrawElement): element is DrawElement & { type: 'circle' | 'arc' } {
  return (element.type === 'circle' || element.type === 'arc') && isElementDraggable(element)
}

export function translateElement(
  element: DrawElement,
  dx: number,
  dy: number,
  canvas?: TranslateCanvasDefaults,
): DrawElement {
  if (dx === 0 && dy === 0) {
    return element
  }

  switch (element.type) {
    case 'debug_grid':
      return element
    case 'text':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx),
        ...spreadAxisDelta('y', element.y, dy, 0),
      }
    case 'multiline':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx),
        ...spreadAxisDelta('y', element.y, dy, 0),
        offset_y: element.offset_y + dy,
      }
    case 'line':
      return {
        ...element,
        ...spreadAxisDelta('x_start', element.x_start, dx),
        ...spreadAxisDelta('x_end', element.x_end, dx),
        ...spreadAxisDelta('y_start', element.y_start, dy, 0),
        ...spreadAxisDelta('y_end', element.y_end, dy, 0),
      }
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
      return {
        ...element,
        ...(isNumericCoordinate(element.x_start) ? { x_start: element.x_start + dx } : {}),
        ...(isNumericCoordinate(element.x_end) ? { x_end: element.x_end + dx } : {}),
        ...(isNumericCoordinate(element.y_start) ? { y_start: element.y_start + dy } : {}),
        ...(isNumericCoordinate(element.y_end) ? { y_end: element.y_end + dy } : {}),
      }
    case 'rectangle_pattern':
      return {
        ...element,
        ...(isNumericCoordinate(element.x_start) ? { x_start: element.x_start + dx } : {}),
        ...(isNumericCoordinate(element.y_start) ? { y_start: element.y_start + dy } : {}),
      }
    case 'polygon':
      return {
        ...element,
        points: element.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      }
    case 'circle':
    case 'arc':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx),
        ...spreadAxisDelta('y', element.y, dy, 0),
      }
    case 'icon':
    case 'icon_sequence':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx),
        ...spreadAxisDelta('y', element.y, dy, 0),
      }
    case 'dlimg':
      return {
        ...element,
        x: element.x + dx,
        y: element.y + dy,
      }
    case 'qrcode':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx),
        ...spreadAxisDelta('y', element.y, dy, 0),
      }
    case 'plot':
      return {
        ...element,
        ...spreadAxisDelta('x_start', element.x_start, dx, 0),
        ...spreadAxisDelta('y_start', element.y_start, dy, 0),
        ...spreadAxisDelta('x_end', element.x_end, dx, canvas?.width),
        ...spreadAxisDelta('y_end', element.y_end, dy, canvas?.height),
      }
    default: {
      const _exhaustive: never = element
      return _exhaustive
    }
  }
}

export function applyBoundsResize(element: DrawElement, bounds: ElementBounds): DrawElement {
  const x2 = bounds.x + bounds.width
  const y2 = bounds.y + bounds.height

  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
      return {
        ...element,
        x_start: bounds.x,
        y_start: bounds.y,
        x_end: x2,
        y_end: y2,
      }
    case 'plot':
      return {
        ...element,
        x_start: bounds.x,
        y_start: bounds.y,
        x_end: x2,
        y_end: y2,
      }
    case 'dlimg':
      return {
        ...element,
        x: bounds.x,
        y: bounds.y,
        xsize: Math.max(1, Math.round(bounds.width)),
        ysize: Math.max(1, Math.round(bounds.height)),
      }
    default:
      return element
  }
}

export function applyLineEndpoint(
  element: DrawElement & { type: 'line' },
  endpoint: 'start' | 'end',
  x: number,
  y: number,
): DrawElement {
  if (endpoint === 'start') {
    return { ...element, x_start: x, y_start: y }
  }
  return { ...element, x_end: x, y_end: y }
}

export function applyRadiusResize(
  element: DrawElement & { type: 'circle' | 'arc' },
  radius: number,
): DrawElement {
  return { ...element, radius: Math.max(1, Math.round(radius)) }
}

export function resizeBoundsWithHandle(
  bounds: ElementBounds,
  handle: ResizeHandle,
  pointerX: number,
  pointerY: number,
  minSize = 8,
): ElementBounds {
  let { x, y, width, height } = bounds
  const right = x + width
  const bottom = y + height

  switch (handle) {
    case 'nw':
      x = pointerX
      y = pointerY
      width = right - x
      height = bottom - y
      break
    case 'n':
      y = pointerY
      height = bottom - y
      break
    case 'ne':
      y = pointerY
      width = pointerX - x
      height = bottom - y
      break
    case 'e':
      width = pointerX - x
      break
    case 'se':
      width = pointerX - x
      height = pointerY - y
      break
    case 's':
      height = pointerY - y
      break
    case 'sw':
      x = pointerX
      width = right - x
      height = pointerY - y
      break
    case 'w':
      x = pointerX
      width = right - x
      break
    default:
      return bounds
  }

  if (width < 0) {
    x += width
    width = Math.abs(width)
  }
  if (height < 0) {
    y += height
    height = Math.abs(height)
  }

  width = Math.max(minSize, width)
  height = Math.max(minSize, height)

  return { x, y, width, height }
}

export function moveElementInArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}
