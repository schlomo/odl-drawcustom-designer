import type { DrawElement } from '../schema/elements'
import { getPropertyEffectiveValue } from '../schema/propertyMetadata'
import { mapColor } from './colors'
import type { ColorOptions } from './types'

/** Spec default from propertyMetadata — matches YAML omit rules and the property panel. */
export function effectiveProperty(element: DrawElement, property: string): unknown {
  return getPropertyEffectiveValue(element, property)
}

export function effectiveNumber(
  element: DrawElement,
  property: string,
  fallback = 0,
  minimum?: number,
  maximum?: number,
): number {
  const value = getPropertyEffectiveValue(element, property)
  let resolved = fallback
  if (typeof value === 'number' && Number.isFinite(value)) {
    resolved = value
  } else if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      resolved = parsed
    }
  }
  if (minimum !== undefined) {
    resolved = Math.max(minimum, resolved)
  }
  if (maximum !== undefined) {
    resolved = Math.min(maximum, resolved)
  }
  return resolved
}

export function effectiveStrokeWidth(element: DrawElement, property = 'width', fallback = 1): number {
  return effectiveNumber(element, property, fallback, 0)
}

export function effectiveFontSize(element: DrawElement, property = 'size', fallback = 20): number {
  return effectiveNumber(element, property, fallback, 1)
}

export function effectiveProgress(element: DrawElement, property = 'progress'): number {
  return effectiveNumber(element, property, 0, 0, 100)
}

export function effectiveString(element: DrawElement, property: string, fallback = ''): string {
  const value = getPropertyEffectiveValue(element, property)
  return typeof value === 'string' ? value : fallback
}

export function effectiveBool(element: DrawElement, property: string, fallback = false): boolean {
  const value = getPropertyEffectiveValue(element, property)
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true' || value === 'True') {
    return true
  }
  if (value === 'false' || value === 'False') {
    return false
  }
  return fallback
}

/** Resolved color name, or null when the spec default is null/none (no fill). */
export function effectiveColorName(element: DrawElement, property: string): string | null {
  const value = getPropertyEffectiveValue(element, property)
  if (value === null || value === 'none') {
    return null
  }
  return typeof value === 'string' ? value : null
}

/** Icon / icon_sequence fill — spec default is black; explicit `none` means no fill on the tag. */
export function resolveIconFillColor(
  element: DrawElement,
  property: string,
  defaultColor: string,
  options: ColorOptions,
): string {
  const value = getPropertyEffectiveValue(element, property)
  if (value === 'none') {
    return 'none'
  }
  const name = typeof value === 'string' ? value : defaultColor
  return mapColor(name, options) ?? '#000000'
}
