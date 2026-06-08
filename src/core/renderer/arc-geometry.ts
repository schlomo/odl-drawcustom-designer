const DEG_TO_RAD = Math.PI / 180

export interface ArcPoint {
  x: number
  y: number
}

export interface ArcBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Spec: 0° = right, increasing clockwise (screen Y-down, same as Pillow pieslice). */
export function degreesToRadians(degrees: number): number {
  return degrees * DEG_TO_RAD
}

export function clockwiseSweepDegrees(startDeg: number, endDeg: number): number {
  const delta = ((endDeg - startDeg) % 360 + 360) % 360
  return delta === 0 && endDeg !== startDeg ? 360 : delta
}

export function isAngleInClockwiseSweep(
  angleDeg: number,
  startDeg: number,
  endDeg: number,
): boolean {
  const sweep = clockwiseSweepDegrees(startDeg, endDeg)
  const offset = ((angleDeg - startDeg) % 360 + 360) % 360
  return offset <= sweep
}

export function pointOnArc(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): ArcPoint {
  const rad = degreesToRadians(angleDeg)
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  }
}

export function buildArcPiePath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = pointOnArc(cx, cy, radius, startDeg)
  const end = pointOnArc(cx, cy, radius, endDeg)
  const sweep = clockwiseSweepDegrees(startDeg, endDeg)
  const largeArc = sweep > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

export function arcPieSliceBounds(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  strokeWidth = 0,
): ArcBounds {
  const points: ArcPoint[] = [{ x: cx, y: cy }]
  points.push(pointOnArc(cx, cy, radius, startDeg))
  points.push(pointOnArc(cx, cy, radius, endDeg))

  for (const cardinal of [0, 90, 180, 270]) {
    if (isAngleInClockwiseSweep(cardinal, startDeg, endDeg)) {
      points.push(pointOnArc(cx, cy, radius, cardinal))
    }
  }

  const pad = strokeWidth / 2
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const maxX = Math.max(...xs) + pad
  const maxY = Math.max(...ys) + pad

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
