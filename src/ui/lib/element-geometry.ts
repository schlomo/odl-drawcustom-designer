import {
  hasTemplateSyntax,
  isNumericStringCoordinate,
  isPercentageCoordinate,
  type DrawElement,
} from '../../core'
import {
  ICON_DEFAULT_ANCHOR,
  anchorPointFromBox,
  iconSequenceBoxSize,
  resolveDirection,
} from '../../core/renderer/anchors'
import { createQrModuleGrid } from '../../core/renderer/qr-modules'
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

export interface TranslateCanvasDefaults {
  width: number
  height: number
}

/** Round pixel coordinates to whole numbers for YAML and canvas edits. */
export function roundCoordinate(value: number): number {
  return Math.round(value)
}

/** Apply drag/nudge delta; materialize omitted numeric coords from `missingDefault` when delta ≠ 0. */
export function applyAxisDelta(
  value: number | string | undefined,
  delta: number,
  missingDefault?: number,
  dimension?: number,
): number | string | undefined {
  if (isNumericCoordinate(value)) {
    return roundCoordinate(value + delta)
  }
  if (typeof value === 'string') {
    if (isPercentageCoordinate(value) && dimension !== undefined) {
      const current = (dimension * Number.parseFloat(value)) / 100
      return roundCoordinate(current + delta)
    }
    if (isNumericStringCoordinate(value)) {
      return roundCoordinate(Number.parseFloat(value) + delta)
    }
    return value
  }
  if (value !== undefined) {
    return value
  }
  if (delta === 0 || missingDefault === undefined) {
    return undefined
  }
  return roundCoordinate(missingDefault + delta)
}

function spreadAxisDelta(
  key: string,
  value: number | string | undefined,
  delta: number,
  missingDefault?: number,
  dimension?: number,
): Record<string, number | string> {
  const next = applyAxisDelta(value, delta, missingDefault, dimension)
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
  if (hasTemplateSyntax(value)) {
    return false
  }
  if (isPercentageCoordinate(value) || isNumericStringCoordinate(value)) {
    return true
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

/** Single scalar size driven from the southeast handle (top-left or center anchor). */
export const SE_SIZE_RESIZE_HANDLE = 'se' as const satisfies ResizeHandle

const BOX_RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function supportsSeSizeResize(element: DrawElement): boolean {
  if (!isElementDraggable(element)) {
    return false
  }
  switch (element.type) {
    case 'icon':
    case 'icon_sequence':
    case 'qrcode':
    case 'circle':
    case 'arc':
      return true
    default:
      return false
  }
}

export function seSizeResizeHandles(): ResizeHandle[] {
  return [SE_SIZE_RESIZE_HANDLE]
}

export function supportsLineEndpointResize(element: DrawElement): element is DrawElement & { type: 'line' } {
  return element.type === 'line' && isElementDraggable(element)
}

export function getResizeHandlesForElement(element: DrawElement): ResizeHandle[] {
  if (supportsLineEndpointResize(element)) {
    return ['line-start', 'line-end']
  }
  if (supportsSeSizeResize(element)) {
    return seSizeResizeHandles()
  }
  if (supportsBoxResize(element)) {
    return BOX_RESIZE_HANDLES
  }
  return []
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
        ...spreadAxisDelta('x', element.x, dx, undefined, canvas?.width),
        ...spreadAxisDelta('y', element.y, dy, 0, canvas?.height),
      }
    case 'multiline':
      return {
        ...element,
        ...spreadAxisDelta('x', element.x, dx, undefined, canvas?.width),
        ...spreadAxisDelta('y', element.y, dy, 0, canvas?.height),
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
        ...(isNumericCoordinate(element.x_start) ? { x_start: roundCoordinate(element.x_start + dx) } : {}),
        ...(isNumericCoordinate(element.x_end) ? { x_end: roundCoordinate(element.x_end + dx) } : {}),
        ...(isNumericCoordinate(element.y_start) ? { y_start: roundCoordinate(element.y_start + dy) } : {}),
        ...(isNumericCoordinate(element.y_end) ? { y_end: roundCoordinate(element.y_end + dy) } : {}),
      }
    case 'rectangle_pattern':
      return {
        ...element,
        ...(isNumericCoordinate(element.x_start) ? { x_start: roundCoordinate(element.x_start + dx) } : {}),
        ...(isNumericCoordinate(element.y_start) ? { y_start: roundCoordinate(element.y_start + dy) } : {}),
      }
    case 'polygon':
      return {
        ...element,
        points: element.points.map(([x, y]) => [roundCoordinate(x + dx), roundCoordinate(y + dy)] as [number, number]),
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
        x: roundCoordinate(element.x + dx),
        y: roundCoordinate(element.y + dy),
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

function iconSequenceSizeFromBounds(
  bounds: ElementBounds,
  direction: ReturnType<typeof resolveDirection>,
): number {
  const horizontal = direction === 'right' || direction === 'left'
  const thickness = horizontal ? bounds.height : bounds.width
  return Math.max(1, Math.round(thickness))
}

function squareSizeFromBounds(bounds: ElementBounds): number {
  return Math.max(1, Math.round(Math.max(bounds.width, bounds.height)))
}

function centerCoordinate(value: number | string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && isNumericStringCoordinate(value)) {
    return Number.parseFloat(value)
  }
  return 0
}

function applyCenterAnchoredSeSize(
  element: DrawElement & { type: 'circle' | 'arc' },
  pointerX: number,
  pointerY: number,
): DrawElement {
  const cx = centerCoordinate(element.x)
  const cy = centerCoordinate(element.y)
  const radius = Math.max(1, Math.round(Math.min(pointerX - cx, pointerY - cy)))
  return { ...element, radius }
}

/** Resize elements that expose one size via the southeast handle. */
export function applySeSizeResize(
  element: DrawElement,
  startBounds: ElementBounds,
  pointerX: number,
  pointerY: number,
): DrawElement {
  if (element.type === 'circle' || element.type === 'arc') {
    return applyCenterAnchoredSeSize(element, pointerX, pointerY)
  }
  const nextBounds = resizeBoundsWithHandle(
    startBounds,
    SE_SIZE_RESIZE_HANDLE,
    pointerX,
    pointerY,
  )
  return applyBoundsResize(element, nextBounds)
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
        x_start: roundCoordinate(bounds.x),
        y_start: roundCoordinate(bounds.y),
        x_end: roundCoordinate(x2),
        y_end: roundCoordinate(y2),
      }
    case 'plot':
      return {
        ...element,
        x_start: roundCoordinate(bounds.x),
        y_start: roundCoordinate(bounds.y),
        x_end: roundCoordinate(x2),
        y_end: roundCoordinate(y2),
      }
    case 'dlimg':
      return {
        ...element,
        x: roundCoordinate(bounds.x),
        y: roundCoordinate(bounds.y),
        xsize: Math.max(1, Math.round(bounds.width)),
        ysize: Math.max(1, Math.round(bounds.height)),
      }
    case 'icon': {
      const size = squareSizeFromBounds(bounds)
      const box = { x: bounds.x, y: bounds.y, width: size, height: size }
      const anchor = anchorPointFromBox(element.anchor, box, ICON_DEFAULT_ANCHOR)
      return {
        ...element,
        x: roundCoordinate(anchor.x),
        y: roundCoordinate(anchor.y),
        size,
      }
    }
    case 'icon_sequence': {
      const direction = resolveDirection(element.direction)
      const hasExplicitSpacing =
        typeof element.spacing === 'number' && Number.isFinite(element.spacing)
      const size = iconSequenceSizeFromBounds(bounds, direction)
      const spacing = hasExplicitSpacing && element.spacing != null ? element.spacing : size / 4
      const layout = iconSequenceBoxSize(size, element.icons.length, spacing, direction)
      const box = { x: bounds.x, y: bounds.y, width: layout.width, height: layout.height }
      const anchor = anchorPointFromBox(element.anchor, box, ICON_DEFAULT_ANCHOR)
      return {
        ...element,
        x: roundCoordinate(anchor.x),
        y: roundCoordinate(anchor.y),
        size,
      }
    }
    case 'qrcode': {
      const { modules } = createQrModuleGrid(element.data)
      const border =
        typeof element.border === 'number' && Number.isFinite(element.border)
          ? Math.max(0, element.border)
          : 1
      const moduleSpan = modules + border * 2
      const pixelSize = Math.max(moduleSpan, squareSizeFromBounds(bounds))
      const boxsize = Math.max(1, Math.round(pixelSize / moduleSpan))
      return {
        ...element,
        x: roundCoordinate(bounds.x),
        y: roundCoordinate(bounds.y),
        boxsize,
      }
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
    return { ...element, x_start: roundCoordinate(x), y_start: roundCoordinate(y) }
  }
  return { ...element, x_end: roundCoordinate(x), y_end: roundCoordinate(y) }
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

  width = Math.max(minSize, roundCoordinate(width))
  height = Math.max(minSize, roundCoordinate(height))

  return { x: roundCoordinate(x), y: roundCoordinate(y), width, height }
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
