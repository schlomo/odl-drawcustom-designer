import type { RenderContext } from './types'
import { hasTemplateSyntax } from '../templates/patterns'

export type CoordinateInput = number | string

export const TEMPLATE_COORDINATE_PLACEHOLDER = 0

export function isPercentageCoordinate(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d+)?%$/.test(value)
}

export function isNumericStringCoordinate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || isPercentageCoordinate(trimmed) || hasTemplateSyntax(trimmed)) {
    return false
  }
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed)
}

export function resolveCoordinate(value: CoordinateInput, dimension: number): number {
  if (typeof value === 'number') {
    return value
  }

  const trimmed = value.trim()
  if (hasTemplateSyntax(trimmed)) {
    return TEMPLATE_COORDINATE_PLACEHOLDER
  }

  const percentMatch = /^(\d+(?:\.\d+)?)%$/.exec(trimmed)
  if (percentMatch) {
    return (dimension * Number.parseFloat(percentMatch[1])) / 100
  }

  const parsed = Number.parseFloat(trimmed)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  return TEMPLATE_COORDINATE_PLACEHOLDER
}

export function resolveX(value: CoordinateInput, ctx: RenderContext): number {
  return resolveCoordinate(value, ctx.width)
}

export function resolveY(value: CoordinateInput | undefined, ctx: RenderContext): number {
  return resolveCoordinate(value ?? 0, ctx.height)
}
