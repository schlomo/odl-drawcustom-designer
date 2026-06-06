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

export function snapDelta(dx: number, dy: number, gridSize: number, enabled: boolean): { dx: number; dy: number } {
  return {
    dx: snapToGrid(dx, gridSize, enabled),
    dy: snapToGrid(dy, gridSize, enabled),
  }
}

/** Snap a dragged element by its selection bounds origin, not the pointer position. */
export function snapMoveDelta(
  startBounds: { x: number; y: number },
  rawDx: number,
  rawDy: number,
  gridSize: number,
  enabled: boolean,
): { dx: number; dy: number } {
  const targetX = snapPosition(startBounds.x + rawDx, gridSize, enabled)
  const targetY = snapPosition(startBounds.y + rawDy, gridSize, enabled)
  return {
    dx: targetX - startBounds.x,
    dy: targetY - startBounds.y,
  }
}
