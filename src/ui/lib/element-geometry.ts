import {
  elementGeometryLocked,
  ICON_DEFAULT_ANCHOR,
  ICON_SEQUENCE_ICONS_PREVIEW,
  anchorPointFromBox,
  createQrModuleGrid,
  iconSequenceBoxSize,
  isNumericStringCoordinate,
  isOppositeResizeHandle,
  isPercentageCoordinate,
  isTemplateStoredValue,
  oppositeResizeHandleForAnchor,
  resolveDirection,
  resolveJsonFieldValue,
  seSizeFromOppositeHandlePointer,
  type DrawElement,
} from '../../core'
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

function iconSequenceIconCount(element: DrawElement & { type: 'icon_sequence' }): number {
  const icons = resolveJsonFieldValue(element.icons, [...ICON_SEQUENCE_ICONS_PREVIEW])
  return icons.length
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
  if (isTemplateStoredValue(value)) {
    return false
  }
  if (isPercentageCoordinate(value) || isNumericStringCoordinate(value)) {
    return true
  }
  return false
}

export function isElementDraggable(element: DrawElement): boolean {
  return element.type !== 'debug_grid' && !elementGeometryLocked(element)
}

export function isElementResizable(element: DrawElement): boolean {
  return getInteractiveResizeHandles(element).length > 0
}

export function supportsBoxResize(element: DrawElement): boolean {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
    case 'plot':
    case 'dlimg':
      return isBoxResizeInteractive(element)
    default:
      return false
  }
}

/** Single scalar size driven from the southeast handle (top-left or center anchor). */
export const SE_SIZE_RESIZE_HANDLE = 'se' as const satisfies ResizeHandle

const BOX_RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export interface CanvasResizeHandle {
  handle: ResizeHandle
  /** False when a template protects the property this handle would overwrite. */
  interactive: boolean
}

/** Omitted size scalars use spec defaults and remain editable on canvas. */
function isEditableResizeScalar(value: unknown): boolean {
  if (value === undefined) {
    return true
  }
  return isInteractiveCoordinate(value)
}

function isSeSizeResizeInteractive(element: DrawElement): boolean {
  switch (element.type) {
    case 'icon':
    case 'icon_sequence':
      return isEditableResizeScalar(element.size)
    case 'qrcode':
      return isEditableResizeScalar(element.boxsize)
    case 'circle':
    case 'arc':
      return isEditableResizeScalar(element.radius)
    default:
      return false
  }
}

function elementHasSeSizeHandle(element: DrawElement): boolean {
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

function isBoxResizeInteractive(element: DrawElement): boolean {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
      return (
        isInteractiveCoordinate(element.x_start) &&
        isInteractiveCoordinate(element.x_end) &&
        isInteractiveCoordinate(element.y_start) &&
        isInteractiveCoordinate(element.y_end)
      )
    case 'plot':
      return (
        isNumericCoordinate(element.x_start ?? 0) &&
        isNumericCoordinate(element.y_start ?? 0) &&
        isNumericCoordinate(element.x_end ?? 0) &&
        isNumericCoordinate(element.y_end ?? 0)
      )
    case 'dlimg':
      return (
        isEditableResizeScalar(element.xsize) &&
        isEditableResizeScalar(element.ysize)
      )
    default:
      return false
  }
}

function elementHasBoxHandles(element: DrawElement): boolean {
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'progress_bar':
    case 'plot':
    case 'dlimg':
      return true
    default:
      return false
  }
}

function isLineEndpointInteractive(
  element: DrawElement & { type: 'line' },
  endpoint: 'start' | 'end',
): boolean {
  if (endpoint === 'start') {
    return (
      isInteractiveCoordinate(element.x_start) &&
      isInteractiveCoordinate(element.y_start ?? 0)
    )
  }
  return (
    isInteractiveCoordinate(element.x_end) &&
    isInteractiveCoordinate(element.y_end ?? 0)
  )
}

function anchorForSeSizeElement(element: DrawElement): string | undefined {
  if (element.type === 'icon' || element.type === 'icon_sequence') {
    return element.anchor
  }
  if (element.type === 'circle' || element.type === 'arc') {
    return 'mm'
  }
  return undefined
}

export function seSizeResizeHandleForElement(element: DrawElement): ResizeHandle {
  return oppositeResizeHandleForAnchor(anchorForSeSizeElement(element), ICON_DEFAULT_ANCHOR)
}

function dlimgPositionTemplated(element: DrawElement & { type: 'dlimg' }): boolean {
  return !isInteractiveCoordinate(element.x) || !isInteractiveCoordinate(element.y)
}

function getDlimgResizeHandles(element: DrawElement & { type: 'dlimg' }): CanvasResizeHandle[] {
  const interactive = isBoxResizeInteractive(element)
  if (!interactive) {
    return BOX_RESIZE_HANDLES.map((handle) => ({ handle, interactive: false }))
  }
  if (dlimgPositionTemplated(element)) {
    return [{ handle: 'se', interactive: true }]
  }
  return BOX_RESIZE_HANDLES.map((handle) => ({ handle, interactive: true }))
}

export function getCanvasResizeHandles(element: DrawElement): CanvasResizeHandle[] {
  if (element.type === 'line') {
    return [
      { handle: 'line-start', interactive: isLineEndpointInteractive(element, 'start') },
      { handle: 'line-end', interactive: isLineEndpointInteractive(element, 'end') },
    ]
  }

  if (elementHasSeSizeHandle(element)) {
    return [
      {
        handle: seSizeResizeHandleForElement(element),
        interactive: isSeSizeResizeInteractive(element),
      },
    ]
  }

  if (elementHasBoxHandles(element)) {
    if (element.type === 'dlimg') {
      return getDlimgResizeHandles(element)
    }
    const interactive = isBoxResizeInteractive(element)
    return BOX_RESIZE_HANDLES.map((handle) => ({ handle, interactive }))
  }

  return []
}

export function getInteractiveResizeHandles(element: DrawElement): ResizeHandle[] {
  return getCanvasResizeHandles(element)
    .filter((entry) => entry.interactive)
    .map((entry) => entry.handle)
}

export function supportsSeSizeResize(element: DrawElement): boolean {
  return elementHasSeSizeHandle(element) && isSeSizeResizeInteractive(element)
}

export function seSizeResizeHandles(element: DrawElement): ResizeHandle[] {
  return [seSizeResizeHandleForElement(element)]
}

export function supportsLineEndpointResize(
  element: DrawElement,
  handle?: ResizeHandle,
): element is DrawElement & { type: 'line' } {
  if (element.type !== 'line') {
    return false
  }
  if (handle === 'line-start') {
    return isLineEndpointInteractive(element, 'start')
  }
  if (handle === 'line-end') {
    return isLineEndpointInteractive(element, 'end')
  }
  return (
    isLineEndpointInteractive(element, 'start') || isLineEndpointInteractive(element, 'end')
  )
}

export function getResizeHandlesForElement(element: DrawElement): ResizeHandle[] {
  return getInteractiveResizeHandles(element)
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
        ...(isNumericCoordinate(element.offset_y)
          ? { offset_y: roundCoordinate(element.offset_y + dy) }
          : {}),
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
      if (typeof element.points === 'string') {
        return element
      }
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
      if (!isNumericCoordinate(element.x) || !isNumericCoordinate(element.y)) {
        return element
      }
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

function resolveCenterFromBoundsOrCoords(
  element: DrawElement & { x: number | string; y?: number | string },
  startBounds: ElementBounds,
): { cx: number; cy: number } {
  if (isInteractiveCoordinate(element.x) && isInteractiveCoordinate(element.y ?? 0)) {
    return {
      cx: centerCoordinate(element.x),
      cy: centerCoordinate(element.y ?? 0),
    }
  }
  return {
    cx: startBounds.x + startBounds.width / 2,
    cy: startBounds.y + startBounds.height / 2,
  }
}

function resolveIconAnchorFromBoundsOrCoords(
  element: DrawElement & { type: 'icon' | 'icon_sequence'; x: number | string; y?: number | string; anchor?: string },
  startBounds: ElementBounds,
): { x: number; y: number } {
  if (isInteractiveCoordinate(element.x) && isInteractiveCoordinate(element.y ?? 0)) {
    return {
      x: centerCoordinate(element.x),
      y: centerCoordinate(element.y ?? 0),
    }
  }
  const box = {
    x: startBounds.x,
    y: startBounds.y,
    width: startBounds.width,
    height: startBounds.height,
  }
  return anchorPointFromBox(element.anchor, box, ICON_DEFAULT_ANCHOR)
}

function applyCenterAnchoredSeSize(
  element: DrawElement & { type: 'circle' | 'arc' },
  startBounds: ElementBounds,
  pointerX: number,
  pointerY: number,
): DrawElement {
  const { cx, cy } = resolveCenterFromBoundsOrCoords(element, startBounds)
  const radius = Math.max(1, Math.round(Math.min(pointerX - cx, pointerY - cy)))
  return { ...element, radius }
}

/** Resize elements that expose one scalar size via the anchor-opposite corner handle. */
export function applySeSizeResize(
  element: DrawElement,
  startBounds: ElementBounds,
  pointerX: number,
  pointerY: number,
  handle: ResizeHandle = seSizeResizeHandleForElement(element),
): DrawElement {
  if (element.type === 'circle' || element.type === 'arc') {
    return applyCenterAnchoredSeSize(element, startBounds, pointerX, pointerY)
  }

  const dragHandle = isOppositeResizeHandle(handle)
    ? handle
    : oppositeResizeHandleForAnchor(anchorForSeSizeElement(element), ICON_DEFAULT_ANCHOR)

  if (element.type === 'icon') {
    const { x: anchorX, y: anchorY } = resolveIconAnchorFromBoundsOrCoords(element, startBounds)
    const size = seSizeFromOppositeHandlePointer(
      element.anchor,
      anchorX,
      anchorY,
      pointerX,
      pointerY,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => ({ width: nextSize, height: nextSize }),
      dragHandle,
    )
    return { ...element, size }
  }

  if (element.type === 'icon_sequence') {
    const direction = resolveDirection(element.direction)
    const { x: anchorX, y: anchorY } = resolveIconAnchorFromBoundsOrCoords(element, startBounds)
    const size = seSizeFromOppositeHandlePointer(
      element.anchor,
      anchorX,
      anchorY,
      pointerX,
      pointerY,
      ICON_DEFAULT_ANCHOR,
      (nextSize) => {
        const spacing =
          typeof element.spacing === 'number' && Number.isFinite(element.spacing)
            ? element.spacing
            : nextSize / 4
        return iconSequenceBoxSize(nextSize, iconSequenceIconCount(element), spacing, direction)
      },
      dragHandle,
    )
    return { ...element, size }
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
    case 'dlimg': {
      const next = { ...element }
      if (isEditableResizeScalar(element.xsize)) {
        next.xsize = Math.max(1, Math.round(bounds.width))
      }
      if (isEditableResizeScalar(element.ysize)) {
        next.ysize = Math.max(1, Math.round(bounds.height))
      }
      if (isInteractiveCoordinate(element.x)) {
        next.x = roundCoordinate(bounds.x)
      }
      if (isInteractiveCoordinate(element.y)) {
        next.y = roundCoordinate(bounds.y)
      }
      return next
    }
    case 'icon': {
      const size = squareSizeFromBounds(bounds)
      const box = { x: bounds.x, y: bounds.y, width: size, height: size }
      const anchor = anchorPointFromBox(element.anchor, box, ICON_DEFAULT_ANCHOR)
      return {
        ...element,
        ...(isInteractiveCoordinate(element.x) ? { x: roundCoordinate(anchor.x) } : {}),
        ...(isInteractiveCoordinate(element.y ?? 0) ? { y: roundCoordinate(anchor.y) } : {}),
        size,
      }
    }
    case 'icon_sequence': {
      const direction = resolveDirection(element.direction)
      const size = iconSequenceSizeFromBounds(bounds, direction)
      const spacing =
        typeof element.spacing === 'number' && Number.isFinite(element.spacing)
          ? element.spacing
          : size / 4
      const layout = iconSequenceBoxSize(size, iconSequenceIconCount(element), spacing, direction)
      const box = { x: bounds.x, y: bounds.y, width: layout.width, height: layout.height }
      const anchor = anchorPointFromBox(element.anchor, box, ICON_DEFAULT_ANCHOR)
      return {
        ...element,
        ...(isInteractiveCoordinate(element.x) ? { x: roundCoordinate(anchor.x) } : {}),
        ...(isInteractiveCoordinate(element.y ?? 0) ? { y: roundCoordinate(anchor.y) } : {}),
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
        ...(isInteractiveCoordinate(element.x) ? { x: roundCoordinate(bounds.x) } : {}),
        ...(isInteractiveCoordinate(element.y ?? 0) ? { y: roundCoordinate(bounds.y) } : {}),
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
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}
