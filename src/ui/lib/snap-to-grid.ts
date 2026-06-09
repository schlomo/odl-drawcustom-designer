import { CANVAS_POINTER_EDGE_EPSILON } from './canvas-zoom'
import type { ElementBounds } from './primitive-bounds'

/** Snap to grid when enabled; otherwise round to the nearest whole pixel. */
export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) {
    return Math.round(value)
  }
  return Math.round(value / gridSize) * gridSize
}

function snapPosition(value: number, gridSize: number, gridEnabled: boolean): number {
  return snapToGrid(value, gridSize, gridEnabled)
}

export function snapThreshold(gridSize: number): number {
  return Math.max(CANVAS_POINTER_EDGE_EPSILON, gridSize / 2)
}

export type CanvasSnapEdge = 'left' | 'top' | 'right' | 'bottom'

/** Which canvas borders the bounds are magnetized to (within snap threshold). */
export function canvasEdgeSnapGuides(
  bounds: ElementBounds,
  canvasW: number,
  canvasH: number,
  grid: number,
  enabled: boolean,
): CanvasSnapEdge[] {
  if (!enabled || grid <= 0) {
    return []
  }

  const threshold = snapThreshold(grid)
  const guides: CanvasSnapEdge[] = []

  if (Math.abs(bounds.x) <= threshold) {
    guides.push('left')
  }
  if (Math.abs(bounds.y) <= threshold) {
    guides.push('top')
  }
  if (Math.abs(bounds.x + bounds.width - canvasW) <= threshold) {
    guides.push('right')
  }
  if (Math.abs(bounds.y + bounds.height - canvasH) <= threshold) {
    guides.push('bottom')
  }

  return guides
}

/** Canvas border guides for a snapped pointer (line endpoints, resize handles). */
export function canvasPointSnapGuides(
  x: number,
  y: number,
  canvasW: number,
  canvasH: number,
  gridSize: number,
  enabled: boolean,
): CanvasSnapEdge[] {
  if (!enabled || gridSize <= 0) {
    return []
  }

  const threshold = snapThreshold(gridSize)
  const guides: CanvasSnapEdge[] = []

  if (Math.abs(x) <= threshold) {
    guides.push('left')
  }
  if (Math.abs(y) <= threshold) {
    guides.push('top')
  }
  if (Math.abs(x - canvasW) <= threshold) {
    guides.push('right')
  }
  if (Math.abs(y - canvasH) <= threshold) {
    guides.push('bottom')
  }

  return guides
}

export interface CanvasSnapGuideLine {
  edge: CanvasSnapEdge
  x1: number
  y1: number
  x2: number
  y2: number
}

export function canvasSnapGuideLines(
  edges: readonly CanvasSnapEdge[],
  canvasW: number,
  canvasH: number,
): CanvasSnapGuideLine[] {
  return edges.map((edge) => {
    switch (edge) {
      case 'left':
        return { edge, x1: 0, y1: 0, x2: 0, y2: canvasH }
      case 'right':
        return { edge, x1: canvasW, y1: 0, x2: canvasW, y2: canvasH }
      case 'top':
        return { edge, x1: 0, y1: 0, x2: canvasW, y2: 0 }
      case 'bottom':
        return { edge, x1: 0, y1: canvasH, x2: canvasW, y2: canvasH }
    }
  })
}

export interface SnapBoundsToCanvasOptions {
  /** When true (default), only move the box; width/height stay fixed. */
  preserveSize?: boolean
}

/** After grid snap, magnetize bounding-box edges to canvas 0 / width / height. */
export function snapBoundsToCanvas(
  bounds: ElementBounds,
  canvasW: number,
  canvasH: number,
  grid: number,
  enabled: boolean,
  options: SnapBoundsToCanvasOptions = {},
): ElementBounds {
  const preserveSize = options.preserveSize ?? true
  if (!enabled || grid <= 0) {
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: bounds.width,
      height: bounds.height,
    }
  }

  const threshold = snapThreshold(grid)

  if (preserveSize) {
    const width = bounds.width
    const height = bounds.height
    const nearRight = Math.abs(bounds.x + width - canvasW) <= threshold
    const nearBottom = Math.abs(bounds.y + height - canvasH) <= threshold
    const nearLeft = Math.abs(bounds.x) <= threshold
    const nearTop = Math.abs(bounds.y) <= threshold

    let x = nearRight ? canvasW - width : nearLeft ? 0 : snapToGrid(bounds.x, grid, true)
    if (!nearRight && !nearLeft && Math.abs(x) <= threshold) {
      x = 0
    }

    let y = nearBottom ? canvasH - height : nearTop ? 0 : snapToGrid(bounds.y, grid, true)
    if (!nearBottom && !nearTop && Math.abs(y) <= threshold) {
      y = 0
    }

    return { x, y, width, height }
  }

  let left = bounds.x
  let top = bounds.y
  let right = bounds.x + bounds.width
  let bottom = bounds.y + bounds.height

  if (Math.abs(right - canvasW) <= threshold) {
    right = canvasW
  } else {
    right = snapToGrid(right, grid, true)
  }

  if (Math.abs(bottom - canvasH) <= threshold) {
    bottom = canvasH
  } else {
    bottom = snapToGrid(bottom, grid, true)
  }

  if (Math.abs(left) <= threshold) {
    left = 0
  } else {
    left = snapToGrid(left, grid, true)
  }

  if (Math.abs(top) <= threshold) {
    top = 0
  } else {
    top = snapToGrid(top, grid, true)
  }

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

/** Snap a canvas point for line endpoints and resize handles. */
export function snapPointToCanvas(
  x: number,
  y: number,
  canvasW: number,
  canvasH: number,
  gridSize: number,
  enabled: boolean,
): { x: number; y: number } {
  if (!enabled || gridSize <= 0) {
    return { x: Math.round(x), y: Math.round(y) }
  }

  const threshold = snapThreshold(gridSize)
  let sx: number
  let sy: number

  if (Math.abs(x - canvasW) <= threshold) {
    sx = canvasW
  } else if (Math.abs(x) <= threshold) {
    sx = 0
  } else {
    sx = snapToGrid(x, gridSize, true)
  }

  if (Math.abs(y - canvasH) <= threshold) {
    sy = canvasH
  } else if (Math.abs(y) <= threshold) {
    sy = 0
  } else {
    sy = snapToGrid(y, gridSize, true)
  }

  return { x: sx, y: sy }
}

export function snapDelta(dx: number, dy: number, gridSize: number, enabled: boolean): { dx: number; dy: number } {
  return {
    dx: snapToGrid(dx, gridSize, enabled),
    dy: snapToGrid(dy, gridSize, enabled),
  }
}

export interface SnapCanvas {
  width: number
  height: number
}

/** Snap a dragged element by its selection bounds origin, not the pointer position. */
export function snapMoveDelta(
  startBounds: ElementBounds,
  rawDx: number,
  rawDy: number,
  gridSize: number,
  enabled: boolean,
  canvas?: SnapCanvas,
): { dx: number; dy: number } {
  const rawTarget: ElementBounds = {
    x: startBounds.x + rawDx,
    y: startBounds.y + rawDy,
    width: startBounds.width,
    height: startBounds.height,
  }

  const snapped =
    enabled && canvas
      ? snapBoundsToCanvas(rawTarget, canvas.width, canvas.height, gridSize, true)
      : {
          x: snapPosition(rawTarget.x, gridSize, enabled),
          y: snapPosition(rawTarget.y, gridSize, enabled),
          width: rawTarget.width,
          height: rawTarget.height,
        }

  return {
    dx: snapped.x - startBounds.x,
    dy: snapped.y - startBounds.y,
  }
}
