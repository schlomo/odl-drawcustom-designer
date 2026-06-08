import type { DrawElement } from './elements'
import { PROPERTIES_BY_TYPE } from './completions'

export interface PropertySpecMeta {
  description: string
  default?: string | number | boolean | null
}

/** Required property keys per element type (from docs/spec/supported_types.md). */
export const REQUIRED_PROPERTIES_BY_TYPE: Record<DrawElement['type'], readonly string[]> = {
  debug_grid: [],
  text: ['value', 'x'],
  multiline: ['value', 'delimiter', 'x', 'offset_y'],
  line: ['x_start', 'x_end'],
  rectangle: ['x_start', 'x_end', 'y_start', 'y_end'],
  rectangle_pattern: [
    'x_start',
    'x_size',
    'x_offset',
    'y_start',
    'y_size',
    'y_offset',
    'x_repeat',
    'y_repeat',
  ],
  polygon: ['points'],
  circle: ['x', 'y', 'radius'],
  ellipse: ['x_start', 'x_end', 'y_start', 'y_end'],
  arc: ['x', 'y', 'radius', 'start_angle', 'end_angle'],
  icon: ['value', 'x', 'y', 'size'],
  icon_sequence: ['x', 'y', 'icons', 'size'],
  dlimg: ['url', 'x', 'y', 'xsize', 'ysize'],
  qrcode: ['data', 'x', 'y'],
  plot: ['data'],
  progress_bar: ['x_start', 'y_start', 'x_end', 'y_end', 'progress'],
}

function computedPropertyDefault(
  element: DrawElement,
  property: string,
): string | number | boolean | null | undefined {
  if (element.type === 'icon_sequence' && property === 'spacing') {
    const size = getPropertyEffectiveValue(element, 'size')
    if (typeof size === 'number' && Number.isFinite(size)) {
      return size / 4
    }
  }
  return undefined
}

const SHARED_PROPERTY_SPECS: Record<string, PropertySpecMeta> = {
  spacing: { description: 'Line spacing for wrapped text', default: 5 },
  line_color: { description: 'Color of the grid lines', default: 'black' },
  dashed: { description: 'Use dashed lines', default: false },
  dash_length: { description: 'Length of dash segments', default: 2 },
  space_length: { description: 'Space between dashes', default: 4 },
  show_labels: { description: 'Label coordinates at grid lines', default: true },
  label_step: { description: 'Label every Nth grid line', default: 40 },
  label_color: { description: 'Color of coordinate labels', default: 'black' },
  label_font_size: { description: 'Font size for coordinate labels', default: 12 },
  font: { description: 'Font file name', default: 'ppb.ttf' },
  x: { description: 'X position' },
  y: { description: 'Y position' },
  size: { description: 'Font or icon size', default: 20 },
  color: { description: 'Text or icon color', default: 'black' },
  anchor: { description: 'Anchor point', default: 'lt' },
  max_width: { description: 'Maximum text width before wrapping' },
  stroke_width: { description: 'Outline width', default: 0 },
  stroke_fill: { description: 'Outline color', default: 'white' },
  y_padding: { description: 'Vertical offset when y is omitted', default: 10 },
  visible: { description: 'Show this element', default: true },
  parse_colors: { description: 'Enable [color]markup[/color] in text', default: false },
  truncate: { description: 'Truncate with ellipsis when text exceeds max_width', default: false },
  delimiter: { description: 'Character that splits text into lines' },
  offset_y: { description: 'Vertical spacing between lines' },
  x_start: { description: 'Left or start X position' },
  x_end: { description: 'Right or end X position' },
  y_start: { description: 'Top or start Y position' },
  y_end: { description: 'Bottom or end Y position' },
  fill: { description: 'Fill color', default: 'black' },
  width: { description: 'Line or border thickness', default: 1 },
  outline: { description: 'Border color', default: 'black' },
  radius: { description: 'Corner or circle radius', default: 0 },
  corners: { description: 'Which corners to round', default: 'all' },
  x_size: { description: 'Width of each rectangle' },
  x_offset: { description: 'Horizontal spacing between rectangles' },
  y_size: { description: 'Height of each rectangle' },
  y_offset: { description: 'Vertical spacing between rectangles' },
  x_repeat: { description: 'Number of horizontal repeats' },
  y_repeat: { description: 'Number of vertical repeats' },
  points: { description: 'Polygon coordinate pairs' },
  start_angle: { description: 'Starting angle (0° = right)' },
  end_angle: { description: 'Ending angle (clockwise)' },
  icons: { description: 'List of Material Design icon names' },
  direction: { description: 'Fill or sequence direction', default: 'right' },
  url: { description: 'Image URL or local path' },
  xsize: { description: 'Target image width' },
  ysize: { description: 'Target image height' },
  resize_method: { description: 'How the image is scaled', default: 'stretch' },
  rotate: { description: 'Rotation angle in degrees', default: 0 },
  data: { description: 'Content to encode or entities to plot' },
  boxsize: { description: 'Size of each QR module', default: 2 },
  border: { description: 'QR code border width', default: 1 },
  bgcolor: { description: 'Background color', default: 'white' },
  ylegend: { description: 'Y-axis legend options' },
  yaxis: { description: 'Y-axis options' },
  xlegend: { description: 'X-axis legend options' },
  xaxis: { description: 'X-axis options' },
  duration: { description: 'Time range to plot', default: 86400 },
  low: { description: 'Minimum Y value' },
  high: { description: 'Maximum Y value' },
  round_values: { description: 'Round axis min/max to integers', default: false },
  debug: { description: 'Show debug borders', default: false },
  progress: { description: 'Progress value (0–100)' },
  background: { description: 'Background color', default: 'white' },
  show_percentage: { description: 'Show percentage text on the bar', default: false },
}

const TYPE_PROPERTY_SPECS: Partial<
  Record<DrawElement['type'], Partial<Record<string, PropertySpecMeta>>>
> = {
  debug_grid: {
    spacing: { description: 'Distance between grid lines', default: 20 },
    dashed: { description: 'Use dashed lines for the grid', default: true },
    font: { description: 'Font for coordinate labels', default: 'ppb.ttf' },
  },
  text: {
    value: { description: 'Text to display' },
    size: { description: 'Font size', default: 20 },
    font: { description: 'Font file name', default: 'ppb.ttf' },
    anchor: { description: 'Text anchor point', default: 'lt' },
    spacing: { description: 'Line spacing for wrapped text', default: 5 },
  },
  multiline: {
    value: { description: 'Text with delimiter-separated lines' },
    size: { description: 'Font size', default: 20 },
    spacing: { description: 'Additional line spacing', default: 0 },
  },
  line: {
    fill: { description: 'Line color', default: 'black' },
    y_padding: { description: 'Vertical offset when y is auto-positioned', default: 0 },
    dashed: { description: 'Enable dashed line', default: false },
    dash_length: { description: 'Length of dashes', default: 5 },
    space_length: { description: 'Space between dashes', default: 3 },
  },
  rectangle: {
    fill: { description: 'Fill color', default: null },
  },
  rectangle_pattern: {
    fill: { description: 'Fill color', default: null },
  },
  polygon: {
    fill: { description: 'Fill color', default: 'none' },
  },
  circle: {
    fill: { description: 'Fill color', default: null },
  },
  ellipse: {
    fill: { description: 'Fill color', default: null },
  },
  arc: {
    fill: { description: 'Fill color', default: 'none' },
  },
  icon: {
    value: { description: 'Material Design icon name' },
    size: { description: 'Icon size in pixels' },
    fill: { description: 'Icon color', default: 'black' },
    anchor: { description: 'Icon anchor point', default: 'la' },
  },
  icon_sequence: {
    fill: { description: 'Icon color', default: 'black' },
    spacing: { description: 'Space between icons (defaults to size / 4)' },
    anchor: { description: 'Icon anchor point', default: 'la' },
    size: { description: 'Size of each icon in pixels' },
  },
  progress_bar: {
    fill: { description: 'Progress bar color', default: 'red' },
  },
  qrcode: {
    data: { description: 'Content to encode in the QR code' },
    color: { description: 'QR module color', default: 'black' },
  },
  plot: {
    data: { description: 'Entities and series to plot' },
    size: { description: 'Legend font size', default: 10 },
    font: { description: 'Font for legend text', default: 'ppb.ttf' },
  },
}

/** Structured plot sub-object fields (task 19-5) — shown instead of raw JSON blobs. */
export const PLOT_NESTED_FIELDS: Record<string, readonly string[]> = {
  ylegend: ['position', 'color', 'size', 'width'],
  yaxis: ['color', 'width', 'tick_width', 'tick_every', 'grid', 'grid_color', 'grid_style'],
  xlegend: ['format', 'interval', 'snap_to_hours', 'position', 'color', 'size', 'width'],
  xaxis: [
    'color',
    'width',
    'tick_width',
    'tick_length',
    'tick_every',
    'grid',
    'grid_color',
    'grid_style',
  ],
}

const PLOT_NESTED_PROPERTY_SPECS: Record<string, PropertySpecMeta> = {
  'ylegend.position': { description: 'Y-axis legend position', default: 'left' },
  'ylegend.color': { description: 'Y-axis legend color', default: 'black' },
  'ylegend.size': { description: 'Y-axis legend font size', default: 10 },
  'ylegend.width': { description: 'Y-axis legend width (-1 for auto)', default: -1 },
  'yaxis.color': { description: 'Y-axis line color', default: 'black' },
  'yaxis.width': { description: 'Y-axis line width', default: 1 },
  'yaxis.tick_width': { description: 'Y-axis tick mark width', default: 2 },
  'yaxis.tick_every': { description: 'Y-axis tick interval', default: 1.0 },
  'yaxis.grid': { description: 'Y-axis grid divisions (0 to disable)', default: 5 },
  'yaxis.grid_color': { description: 'Y-axis grid color', default: 'black' },
  'yaxis.grid_style': { description: 'Y-axis grid line style', default: 'dotted' },
  'xlegend.format': { description: 'X-axis time label format', default: '%H:%M' },
  'xlegend.interval': { description: 'X-axis label interval in seconds', default: 3600 },
  'xlegend.snap_to_hours': { description: 'Align X labels to whole hours', default: true },
  'xlegend.position': { description: 'X-axis legend position', default: 'bottom' },
  'xlegend.color': { description: 'X-axis legend color', default: 'black' },
  'xlegend.size': { description: 'X-axis legend font size', default: 10 },
  'xlegend.width': { description: 'X-axis legend width (-1 for auto)', default: -1 },
  'xaxis.color': { description: 'X-axis line color', default: 'black' },
  'xaxis.width': { description: 'X-axis line width', default: 1 },
  'xaxis.tick_width': { description: 'X-axis tick mark width', default: 2 },
  'xaxis.tick_length': { description: 'X-axis tick mark length', default: 4 },
  'xaxis.tick_every': { description: 'X-axis tick interval', default: 1.0 },
  'xaxis.grid': { description: 'X-axis grid divisions (0 to disable)', default: 5 },
  'xaxis.grid_color': { description: 'X-axis grid color', default: 'black' },
  'xaxis.grid_style': { description: 'X-axis grid line style', default: 'dotted' },
}

const PLOT_NESTED_PARENT_KEYS = new Set(Object.keys(PLOT_NESTED_FIELDS))

/** Plot fields with spec "Auto" defaults — always show in the property panel. */
const PLOT_INSPECTOR_ALWAYS_VISIBLE = new Set(['low', 'high'])

export function isPlotNestedProperty(property: string): boolean {
  return property.includes('.') && property in PLOT_NESTED_PROPERTY_SPECS
}

export function parsePlotNestedProperty(
  property: string,
): { parent: string; child: string } | null {
  const dot = property.indexOf('.')
  if (dot <= 0) {
    return null
  }
  const parent = property.slice(0, dot)
  const child = property.slice(dot + 1)
  if (!PLOT_NESTED_PARENT_KEYS.has(parent)) {
    return null
  }
  return { parent, child }
}

export function getPlotNestedPropertyKeys(): string[] {
  return Object.entries(PLOT_NESTED_FIELDS).flatMap(([parent, children]) =>
    children.map((child) => `${parent}.${child}`),
  )
}

export function getNestedPropertyValue(element: DrawElement, property: string): unknown {
  const parsed = parsePlotNestedProperty(property)
  if (!parsed) {
    return undefined
  }
  const parentValue = (element as Record<string, unknown>)[parsed.parent]
  if (!parentValue || typeof parentValue !== 'object') {
    return undefined
  }
  return (parentValue as Record<string, unknown>)[parsed.child]
}

export function setNestedPropertyValue(
  element: DrawElement,
  property: string,
  value: unknown,
): DrawElement {
  const parsed = parsePlotNestedProperty(property)
  if (!parsed) {
    return element
  }
  const record = element as Record<string, unknown>
  const currentParent = record[parsed.parent]
  const parentObject =
    currentParent && typeof currentParent === 'object'
      ? { ...(currentParent as Record<string, unknown>) }
      : {}

  if (value === undefined) {
    delete parentObject[parsed.child]
  } else {
    parentObject[parsed.child] = value
  }

  const next = { ...record }
  if (Object.keys(parentObject).length === 0) {
    delete next[parsed.parent]
  } else {
    next[parsed.parent] = parentObject
  }
  return next as DrawElement
}

export function isRequiredProperty(
  elementType: DrawElement['type'],
  property: string,
): boolean {
  return REQUIRED_PROPERTIES_BY_TYPE[elementType].includes(property)
}

export function getPropertySpec(
  elementType: DrawElement['type'],
  property: string,
): PropertySpecMeta {
  const nested = PLOT_NESTED_PROPERTY_SPECS[property]
  if (elementType === 'plot' && nested) {
    return nested
  }
  const typeSpec = TYPE_PROPERTY_SPECS[elementType]?.[property]
  const shared = SHARED_PROPERTY_SPECS[property]
  const hasTypeOverride = Object.hasOwn(TYPE_PROPERTY_SPECS[elementType] ?? {}, property)
  return {
    description: typeSpec?.description ?? shared?.description ?? property,
    default: hasTypeOverride ? typeSpec?.default : shared?.default,
  }
}

export function getPropertyDescription(
  elementType: DrawElement['type'],
  property: string,
): string {
  return getPropertySpec(elementType, property).description
}

export function getPropertyDefault(
  elementType: DrawElement['type'],
  property: string,
): string | number | boolean | null | undefined {
  return getPropertySpec(elementType, property).default
}

export function hasPropertyDefault(
  elementType: DrawElement['type'],
  property: string,
): boolean {
  if (elementType === 'icon_sequence' && property === 'spacing') {
    return true
  }
  return getPropertyDefault(elementType, property) !== undefined
}

/** Value for the inspector: stored YAML value, else spec default when defined. */
export function getPropertyEffectiveValue(element: DrawElement, property: string): unknown {
  if (element.type === 'plot' && isPlotNestedProperty(property)) {
    const stored = getNestedPropertyValue(element, property)
    if (stored !== undefined) {
      return stored
    }
    return getPropertyDefault(element.type, property)
  }

  const record = element as Record<string, unknown>
  const stored = record[property]
  if (stored !== undefined) {
    return stored
  }
  const computed = computedPropertyDefault(element, property)
  if (computed !== undefined) {
    return computed
  }
  return getPropertyDefault(element.type, property)
}

/** Omit YAML keys that match the spec default. */
export function normalizePropertyValueForStorage(
  element: DrawElement,
  property: string,
  value: unknown,
): unknown {
  if (value === undefined || value === null) {
    return undefined
  }
  const defaultValue =
    computedPropertyDefault(element, property) ?? getPropertyDefault(element.type, property)
  if (defaultValue === undefined) {
    return value
  }
  return value === defaultValue ? undefined : value
}

export function applyPlotPropertyUpdate(
  element: DrawElement,
  property: string,
  value: unknown,
): DrawElement {
  if (element.type !== 'plot') {
    return element
  }
  if (isPlotNestedProperty(property)) {
    const normalized = normalizePropertyValueForStorage(element, property, value)
    return setNestedPropertyValue(element, property, normalized)
  }
  const record = { ...(element as Record<string, unknown>) }
  if (value === undefined) {
    delete record[property]
  } else {
    record[property] = value
  }
  return record as DrawElement
}

/** Required keys, keys present in YAML, and optional keys with a documented default. */
export function getVisibleProperties(element: DrawElement): string[] {
  const elementType = element.type
  const keys = PROPERTIES_BY_TYPE[elementType]
  const required = new Set(REQUIRED_PROPERTIES_BY_TYPE[elementType])
  const record = element as Record<string, unknown>

  if (elementType === 'plot') {
    const nestedKeys = getPlotNestedPropertyKeys()
    const topLevel = keys.filter((key) => !PLOT_NESTED_PARENT_KEYS.has(key))
    const visibleTopLevel = topLevel.filter(
      (key) =>
        required.has(key) ||
        PLOT_INSPECTOR_ALWAYS_VISIBLE.has(key) ||
        record[key] !== undefined ||
        hasPropertyDefault(elementType, key),
    )
    const visibleNested = nestedKeys.filter((key) => {
      const stored = getNestedPropertyValue(element, key)
      return stored !== undefined || hasPropertyDefault(elementType, key)
    })
    return [...visibleTopLevel, ...visibleNested]
  }

  return keys.filter(
    (key) =>
      required.has(key) ||
      record[key] !== undefined ||
      hasPropertyDefault(elementType, key),
  )
}
