import { hasTemplateSyntax } from '../templates/patterns'
import type { DrawElement } from './elements'
import { ENUMS } from './completions'
import { getNestedPropertyValue, isPlotNestedProperty } from './propertyMetadata'

export type PropertyEditorShape =
  | 'number'
  | 'boolean'
  | 'enum'
  | 'string'
  | 'coordinate'
  | 'json'
  | 'color'
  | 'font'
  | 'icon'

export type PropertyEditorMode = 'scalar' | 'template'

export function isTemplateStoredValue(value: unknown): value is string {
  return typeof value === 'string' && hasTemplateSyntax(value)
}

export function resolveEditorMode(value: unknown, shape: PropertyEditorShape): PropertyEditorMode {
  if (shape === 'json') {
    if (typeof value === 'string') {
      return isTemplateStoredValue(value) ? 'template' : 'scalar'
    }
    return 'scalar'
  }
  if (isTemplateStoredValue(value)) {
    return 'template'
  }
  return 'scalar'
}

const BOOLEAN_PROPERTIES = new Set([
  'visible',
  'dashed',
  'parse_colors',
  'truncate',
  'show_percentage',
  'show_labels',
  'round_values',
  'debug',
  'smooth',
  'show_points',
  'snap_to_hours',
])

const NUMBER_PROPERTIES = new Set([
  'size',
  'spacing',
  'offset_y',
  'width',
  'radius',
  'start_angle',
  'end_angle',
  'xsize',
  'ysize',
  'rotate',
  'boxsize',
  'border',
  'progress',
  'dash_length',
  'space_length',
  'label_step',
  'label_font_size',
  'stroke_width',
  'y_padding',
  'x_size',
  'x_offset',
  'y_size',
  'y_offset',
  'x_repeat',
  'y_repeat',
  'duration',
  'low',
  'high',
  'tick_width',
  'tick_length',
  'tick_every',
  'point_size',
  'value_scale',
  'interval',
])

const COORDINATE_PROPERTIES = new Set([
  'x',
  'y',
  'x_start',
  'x_end',
  'y_start',
  'y_end',
  'max_width',
])

const JSON_PROPERTIES = new Set(['points', 'icons', 'data'])

const MULTILINE_STRING_PROPERTIES = new Set(['value', 'url'])

const ENUM_PROPERTY_MAP: Record<string, keyof typeof ENUMS> = {
  anchor: 'anchor',
  color: 'color',
  fill: 'color',
  outline: 'color',
  background: 'color',
  line_color: 'color',
  label_color: 'color',
  bgcolor: 'color',
  line_color_plot: 'color',
  direction: 'direction',
  resize_method: 'resize_method',
  line_style: 'line_style',
  grid_style: 'grid_style',
  corners: 'corners',
}

const Y_LEGEND_POSITIONS = ['left', 'right'] as const
const X_LEGEND_POSITIONS = ['bottom', 'top'] as const

function plotNestedChild(property: string): string | null {
  const dot = property.indexOf('.')
  return dot > 0 ? property.slice(dot + 1) : null
}

function enumNameForProperty(property: string): keyof typeof ENUMS | null {
  if (property in ENUM_PROPERTY_MAP) {
    return ENUM_PROPERTY_MAP[property]
  }
  const leaf = plotNestedChild(property) ?? property
  if (
    leaf === 'stroke_fill' ||
    leaf === 'grid_color' ||
    leaf === 'point_color' ||
    leaf.endsWith('_color')
  ) {
    return 'color'
  }
  return null
}

export function getPropertyEditorShape(
  elementType: DrawElement['type'],
  property: string,
): PropertyEditorShape {
  const leaf = plotNestedChild(property) ?? property

  if (leaf === 'grid') {
    return typeof property === 'string' ? 'number' : 'number'
  }
  if (leaf === 'format') {
    return 'string'
  }
  if (JSON_PROPERTIES.has(property)) {
    return 'json'
  }
  if (property === 'font') {
    return 'font'
  }
  if (property === 'value' && elementType === 'icon') {
    return 'icon'
  }
  if (property === 'ylegend.position' || property === 'xlegend.position' || enumNameForProperty(leaf)) {
    return property.endsWith('_color') || leaf.endsWith('_color') || leaf === 'color' || leaf === 'fill' || leaf === 'outline' || leaf === 'background' || leaf === 'bgcolor' || leaf === 'line_color' || leaf === 'label_color' || leaf === 'stroke_fill' || leaf === 'grid_color' || leaf === 'point_color'
      ? 'color'
      : 'enum'
  }
  if (BOOLEAN_PROPERTIES.has(leaf)) {
    return 'boolean'
  }
  if (COORDINATE_PROPERTIES.has(leaf)) {
    return 'coordinate'
  }
  if (NUMBER_PROPERTIES.has(leaf)) {
    return 'number'
  }
  if (MULTILINE_STRING_PROPERTIES.has(property)) {
    return 'string'
  }
  if (property === 'delimiter') {
    return 'string'
  }
  return 'string'
}

export function getPropertyEnumValuesForShape(property: string): readonly string[] | null {
  if (property === 'ylegend.position') {
    return Y_LEGEND_POSITIONS
  }
  if (property === 'xlegend.position') {
    return X_LEGEND_POSITIONS
  }
  const enumName = enumNameForProperty(plotNestedChild(property) ?? property)
  if (!enumName) {
    return null
  }
  return ENUMS[enumName].map(String)
}

/** Canvas position properties — templated values lock drag, nudge, and align. */
export const POSITION_LOCK_PROPERTIES_BY_TYPE: Record<DrawElement['type'], readonly string[]> = {
  debug_grid: [],
  text: ['x', 'y'],
  multiline: ['x', 'y'],
  line: ['x_start', 'x_end', 'y_start', 'y_end'],
  rectangle: ['x_start', 'x_end', 'y_start', 'y_end'],
  rectangle_pattern: ['x_start', 'y_start'],
  polygon: ['points'],
  circle: ['x', 'y'],
  ellipse: ['x_start', 'x_end', 'y_start', 'y_end'],
  arc: ['x', 'y'],
  icon: ['x', 'y'],
  icon_sequence: ['x', 'y'],
  dlimg: ['x', 'y'],
  qrcode: ['x', 'y'],
  plot: ['x_start', 'y_start', 'x_end', 'y_end'],
  progress_bar: ['x_start', 'y_start', 'x_end', 'y_end'],
}

/** @deprecated Use {@link POSITION_LOCK_PROPERTIES_BY_TYPE}. Resize lock is per-handle in element-geometry. */
export const GEOMETRY_PROPERTIES_BY_TYPE = POSITION_LOCK_PROPERTIES_BY_TYPE

export function getPositionLockProperties(element: DrawElement): readonly string[] {
  return POSITION_LOCK_PROPERTIES_BY_TYPE[element.type]
}

export function getGeometryProperties(element: DrawElement): readonly string[] {
  return getPositionLockProperties(element)
}

function getStoredPropertyValue(element: DrawElement, property: string): unknown {
  if (isPlotNestedProperty(property)) {
    return getNestedPropertyValue(element, property)
  }
  return (element as Record<string, unknown>)[property]
}

export function isPropertyTemplated(element: DrawElement, property: string): boolean {
  const stored = getStoredPropertyValue(element, property)
  if (stored === undefined) {
    return false
  }
  if (property === 'points' || property === 'icons' || property === 'data') {
    return isTemplateStoredValue(stored)
  }
  return isTemplateStoredValue(stored)
}

export function elementPositionLocked(element: DrawElement): boolean {
  return getPositionLockProperties(element).some((property) => isPropertyTemplated(element, property))
}

/** True when drag, nudge, or align must stay disabled for this element. */
export function elementGeometryLocked(element: DrawElement): boolean {
  return elementPositionLocked(element)
}

/** When a JSON field holds a whole-field template, use a preview placeholder. */
export function resolveJsonFieldValue<T>(value: T | string, fallback: T): T {
  if (typeof value === 'string') {
    return fallback
  }
  return value
}

export const POLYGON_POINTS_PREVIEW: [number, number][] = [
  [0, 0],
  [60, 0],
  [30, 40],
]

export const ICON_SEQUENCE_ICONS_PREVIEW = ['help-circle'] as const

export const PLOT_DATA_PREVIEW = [
  { entity: 'sensor.template', color: 'black', width: 1 },
] as const

export {
  BOOLEAN_PROPERTIES as TEMPLATE_BOOLEAN_PROPERTIES,
  NUMBER_PROPERTIES as TEMPLATE_NUMBER_PROPERTIES,
  COORDINATE_PROPERTIES as TEMPLATE_COORDINATE_PROPERTIES,
  JSON_PROPERTIES as TEMPLATE_JSON_PROPERTIES,
}
