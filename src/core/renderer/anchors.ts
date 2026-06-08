/** Pillow-style text/icon anchors (docs/spec/supported_types.md). */

export const TEXT_DEFAULT_ANCHOR = 'lt'
export const ICON_DEFAULT_ANCHOR = 'la'

export interface AnchoredBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Convert an anchor point plus box size into a top-left origin for drawing.
 * Horizontal: l/m/r — vertical: t/a/m/b/d (ascender ≈ top for stub metrics).
 */
export interface AnchoredBoxMetrics {
  /** Distance from box top to the text baseline (Pillow `s` anchor). */
  baselineOffset?: number
}

export function resolveAnchoredBox(
  anchor: string | undefined,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  defaultAnchor: string,
  metrics?: AnchoredBoxMetrics,
): AnchoredBox {
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  const horizontal = normalized[0] ?? 'l'
  const vertical = normalized[1] ?? 'a'

  let dx = 0
  if (horizontal === 'm') {
    dx = -width / 2
  } else if (horizontal === 'r') {
    dx = -width
  }

  let dy = 0
  if (vertical === 'm') {
    dy = -height / 2
  } else if (vertical === 's') {
    dy = -(metrics?.baselineOffset ?? height)
  } else if (vertical === 'b' || vertical === 'd') {
    dy = -height
  }

  return {
    x: anchorX + dx,
    y: anchorY + dy,
    width,
    height,
  }
}

/** Inverse of {@link resolveAnchoredBox}: anchor point for a drawn box origin. */
export function anchorPointFromBox(
  anchor: string | undefined,
  box: AnchoredBox,
  defaultAnchor: string,
  metrics?: AnchoredBoxMetrics,
): { x: number; y: number } {
  const normalized = (anchor ?? defaultAnchor).trim().toLowerCase()
  const horizontal = normalized[0] ?? 'l'
  const vertical = normalized[1] ?? 'a'

  let dx = 0
  if (horizontal === 'm') {
    dx = -box.width / 2
  } else if (horizontal === 'r') {
    dx = -box.width
  }

  let dy = 0
  if (vertical === 'm') {
    dy = -box.height / 2
  } else if (vertical === 's') {
    dy = -(metrics?.baselineOffset ?? box.height)
  } else if (vertical === 'b' || vertical === 'd') {
    dy = -box.height
  }

  return {
    x: box.x - dx,
    y: box.y - dy,
  }
}

export function resolveNumericSize(size: number | string): number {
  if (typeof size === 'number') {
    return size
  }
  const parsed = Number.parseFloat(size)
  return Number.isFinite(parsed) ? parsed : 0
}

export type ResolvedDirection = 'right' | 'left' | 'up' | 'down'

const DIRECTION_VALUES: readonly ResolvedDirection[] = ['right', 'left', 'up', 'down']

/** Use a known direction for preview; templated values fall back to the default. */
export function resolveDirection(
  value: string | undefined,
  defaultValue: ResolvedDirection = 'right',
): ResolvedDirection {
  if (value != null && DIRECTION_VALUES.includes(value as ResolvedDirection)) {
    return value as ResolvedDirection
  }
  return defaultValue
}

export function iconSequenceBoxSize(
  size: number,
  iconCount: number,
  spacing: number,
  direction: 'right' | 'left' | 'up' | 'down',
): { width: number; height: number } {
  const span = Math.max(0, iconCount - 1) * (size + spacing)
  if (direction === 'right' || direction === 'left') {
    return { width: size + span, height: size }
  }
  return { width: size, height: span + size }
}

export function iconSequenceIconPositions(
  originX: number,
  originY: number,
  size: number,
  iconCount: number,
  spacing: number,
  direction: ResolvedDirection,
): Array<{ x: number; y: number }> {
  const step = size + spacing
  const positions: Array<{ x: number; y: number }> = []

  for (let index = 0; index < iconCount; index += 1) {
    if (direction === 'right') {
      positions.push({ x: originX + index * step, y: originY })
    } else if (direction === 'left') {
      positions.push({ x: originX + (iconCount - 1 - index) * step, y: originY })
    } else if (direction === 'down') {
      positions.push({ x: originX, y: originY + index * step })
    } else {
      positions.push({ x: originX, y: originY + (iconCount - 1 - index) * step })
    }
  }

  return positions
}
