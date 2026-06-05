import type { RenderContext } from './types'

export type CoordinateInput = number | string

export function resolveCoordinate(value: CoordinateInput, dimension: number): number {
  if (typeof value === 'number') {
    return value
  }

  const match = /^(\d+(?:\.\d+)?)%$/.exec(value)
  if (!match) {
    throw new Error(`Invalid coordinate: ${value}`)
  }

  return (dimension * Number.parseFloat(match[1])) / 100
}

export function resolveX(value: CoordinateInput, ctx: RenderContext): number {
  return resolveCoordinate(value, ctx.width)
}

export function resolveY(value: CoordinateInput | undefined, ctx: RenderContext): number {
  return resolveCoordinate(value ?? 0, ctx.height)
}
