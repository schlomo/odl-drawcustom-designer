import {
  arcPieSliceBounds,
  iconSequenceBoxSize,
  type RenderPrimitive,
} from '../../core'

export interface ElementBounds {
  x: number
  y: number
  width: number
  height: number
}

const MIN_HIT_SIZE = 8

function padBounds(bounds: ElementBounds, padding = 4): ElementBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}

function fromPoints(points: [number, number][]): ElementBounds {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function ensureMinSize(bounds: ElementBounds): ElementBounds {
  return {
    x: bounds.x - Math.max(0, (MIN_HIT_SIZE - bounds.width) / 2),
    y: bounds.y - Math.max(0, (MIN_HIT_SIZE - bounds.height) / 2),
    width: Math.max(bounds.width, MIN_HIT_SIZE),
    height: Math.max(bounds.height, MIN_HIT_SIZE),
  }
}

export function getPrimitiveBounds(primitive: RenderPrimitive): ElementBounds {
  switch (primitive.kind) {
    case 'line': {
      const bounds = fromPoints([
        [primitive.x1, primitive.y1],
        [primitive.x2, primitive.y2],
      ])
      return padBounds(ensureMinSize(bounds), primitive.strokeWidth)
    }
    case 'rect':
      return { x: primitive.x, y: primitive.y, width: primitive.width, height: primitive.height }
    case 'circle':
      return {
        x: primitive.cx - primitive.r,
        y: primitive.cy - primitive.r,
        width: primitive.r * 2,
        height: primitive.r * 2,
      }
    case 'ellipse':
      return {
        x: primitive.cx - primitive.rx,
        y: primitive.cy - primitive.ry,
        width: primitive.rx * 2,
        height: primitive.ry * 2,
      }
    case 'polygon':
      return fromPoints(primitive.points)
    case 'arc':
      return arcPieSliceBounds(
        primitive.cx,
        primitive.cy,
        primitive.r,
        primitive.startAngle,
        primitive.endAngle,
        primitive.strokeWidth ?? 0,
      )
    case 'icon':
      return { x: primitive.x, y: primitive.y, width: primitive.size, height: primitive.size }
    case 'icon_sequence': {
      const { width, height } = iconSequenceBoxSize(
        primitive.size,
        primitive.icons.length,
        primitive.spacing,
        primitive.direction,
      )
      return { x: primitive.x, y: primitive.y, width, height }
    }
    case 'rectangle-pattern-stub':
      if (primitive.rects.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 }
      }
      return fromPoints(
        primitive.rects.flatMap((rect) => [
          [rect.x, rect.y] as [number, number],
          [rect.x + rect.width, rect.y + rect.height] as [number, number],
        ]),
      )
    case 'progress-bar-stub':
      return {
        x: primitive.background.x,
        y: primitive.background.y,
        width: primitive.background.width,
        height: primitive.background.height,
      }
    case 'debug-grid-stub':
      return { x: 0, y: 0, width: primitive.width, height: primitive.height }
    case 'render-error':
      return { x: primitive.x, y: primitive.y, width: primitive.width, height: primitive.height }
    case 'text-stub':
    case 'multiline-stub':
    case 'dlimg-stub':
    case 'qrcode':
    case 'plot':
      return { x: primitive.x, y: primitive.y, width: primitive.width, height: primitive.height }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}

export function pointInBounds(x: number, y: number, bounds: ElementBounds): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  )
}
