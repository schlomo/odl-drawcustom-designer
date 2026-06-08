import type { ElementBounds } from './primitive-bounds'

export function normalizeMarqueeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): ElementBounds {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function boundsFullyEnclosedInRect(
  bounds: ElementBounds,
  rect: ElementBounds,
): boolean {
  return (
    bounds.x >= rect.x &&
    bounds.y >= rect.y &&
    bounds.x + bounds.width <= rect.x + rect.width &&
    bounds.y + bounds.height <= rect.y + rect.height
  )
}

export function selectIndicesEnclosedInRect(
  hitTargets: { index: number; bounds: ElementBounds }[],
  rect: ElementBounds,
): number[] {
  return hitTargets
    .filter(({ bounds }) => boundsFullyEnclosedInRect(bounds, rect))
    .map(({ index }) => index)
}
