import type { DrawElement } from '../../core'
import { getPlotNestedPropertyKeys, getPropertyEffectiveValue } from '../../core'

const COLOR_PROPERTY_KEYS = new Set([
  'fill',
  'outline',
  'background',
  'color',
  'bgcolor',
  'line_color',
  'label_color',
  'stroke_fill',
  'grid_color',
])

function isTemplateColor(value: string): boolean {
  return value.includes('{{') || value.includes('{%')
}

function pushColorValue(values: string[], value: unknown): void {
  if (typeof value !== 'string') {
    return
  }
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'none' || isTemplateColor(trimmed)) {
    return
  }
  values.push(trimmed)
}

function collectPlotSeriesColors(element: Extract<DrawElement, { type: 'plot' }>, values: string[]): void {
  if (!Array.isArray(element.data)) {
    return
  }

  for (const series of element.data) {
    if (series == null || typeof series !== 'object') {
      continue
    }
    const record = series as Record<string, unknown>
    pushColorValue(values, record.color)
    pushColorValue(values, record.point_color)
  }
}

function collectPlotNestedColors(element: Extract<DrawElement, { type: 'plot' }>, values: string[]): void {
  for (const property of getPlotNestedPropertyKeys()) {
    if (!property.endsWith('.color') && !property.endsWith('_color')) {
      continue
    }
    pushColorValue(values, getPropertyEffectiveValue(element, property))
  }
}

/** Collect resolved color tokens from an element for clamp analysis. */
export function collectElementColorValues(element: DrawElement): string[] {
  const values: string[] = []

  if (element.type === 'plot') {
    collectPlotSeriesColors(element, values)
    collectPlotNestedColors(element, values)
    return values
  }

  for (const [key, value] of Object.entries(element as Record<string, unknown>)) {
    if (key === 'type' || !COLOR_PROPERTY_KEYS.has(key)) {
      continue
    }
    pushColorValue(values, value)
  }

  return values
}

export function collectDesignColorValues(elements: readonly DrawElement[]): string[] {
  const values: string[] = []
  for (const element of elements) {
    values.push(...collectElementColorValues(element))
  }
  return values
}
