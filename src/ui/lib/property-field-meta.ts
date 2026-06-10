import {
  DEBUG_GRID_MIN_SPACING,
  ENUMS,
  getPropertyDefault,
  getPropertyDescription,
  getPropertyEffectiveValue,
  getVisibleProperties,
  normalizePropertyValueForStorage,
  hasTemplateSyntax,
  type DrawElement,
} from '../../core'

export type PropertyFieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'json'

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
  'x',
  'y',
  'size',
  'spacing',
  'offset_y',
  'x_start',
  'x_end',
  'y_start',
  'y_end',
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
  'max_width',
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

/** Thickness, size, and spacing fields — must not be negative in the inspector. */
export const NON_NEGATIVE_NUMBER_PROPERTIES = new Set([
  'width',
  'radius',
  'dash_length',
  'space_length',
  'boxsize',
  'border',
  'label_step',
  'label_font_size',
  'stroke_width',
  'size',
  'spacing',
  'offset_y',
  'xsize',
  'ysize',
  'x_size',
  'x_offset',
  'y_size',
  'y_offset',
  'tick_width',
  'tick_length',
  'point_size',
  'y_padding',
  'max_width',
])

/** Plot legend widths use -1 as an auto-width sentinel — not the generic non-negative `width` leaf. */
const ALLOW_NEGATIVE_NUMBER_PROPERTIES = new Set(['ylegend.width', 'xlegend.width'])

export function isAllowNegativeNumberProperty(property: string): boolean {
  return ALLOW_NEGATIVE_NUMBER_PROPERTIES.has(property)
}

export function isNonNegativeNumberProperty(property: string): boolean {
  if (isAllowNegativeNumberProperty(property)) {
    return false
  }
  return NON_NEGATIVE_NUMBER_PROPERTIES.has(propertyLeaf(property))
}

const CLAMPED_0_100_PROPERTIES = new Set(['progress'])

export function isClampedPercentProperty(property: string): boolean {
  return CLAMPED_0_100_PROPERTIES.has(property)
}

/** Pixel/layout numbers stored as whole integers in YAML. */
export const POSITION_NUMBER_PROPERTIES = new Set([
  'x',
  'y',
  'size',
  'spacing',
  'offset_y',
  'x_start',
  'x_end',
  'y_start',
  'y_end',
  'width',
  'radius',
  'dash_length',
  'space_length',
  'boxsize',
  'border',
  'label_step',
  'label_font_size',
  'stroke_width',
  'xsize',
  'ysize',
  'x_size',
  'x_offset',
  'y_size',
  'y_offset',
  'tick_width',
  'tick_length',
  'point_size',
  'y_padding',
  'max_width',
])

export function isPositionNumberProperty(property: string): boolean {
  return POSITION_NUMBER_PROPERTIES.has(propertyLeaf(property))
}

export function roundPositionNumber(property: string, value: number): number {
  if (!isPositionNumberProperty(property)) {
    return value
  }
  return Math.round(value)
}

/** Type-specific minimums for inspector number fields (matches renderer floors). */
export function clampNumberPropertyForElement(
  element: DrawElement,
  property: string,
  value: number,
): number {
  if (element.type === 'debug_grid' && propertyLeaf(property) === 'spacing') {
    return Math.max(DEBUG_GRID_MIN_SPACING, value)
  }
  return value
}

const JSON_PROPERTIES = new Set(['points', 'icons'])

/** plot `data` is edited as JSON; multiline `value` fields are separate. */
export const MULTILINE_STRING_PROPERTIES = new Set(['value', 'url', 'data'])

export const TEMPLATE_EDITOR_OPTION = '__template__'
export const TEMPLATE_EDITOR_STARTER = '{{ }}'

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

function enumNameForProperty(property: string): keyof typeof ENUMS | null {
  if (property in ENUM_PROPERTY_MAP) {
    return ENUM_PROPERTY_MAP[property]
  }
  if (
    property === 'stroke_fill' ||
    property === 'grid_color' ||
    property === 'point_color' ||
    property.endsWith('_color')
  ) {
    return 'color'
  }
  return null
}

function plotNestedChild(property: string): string | null {
  const dot = property.indexOf('.')
  return dot > 0 ? property.slice(dot + 1) : null
}

function propertyLeaf(property: string): string {
  return plotNestedChild(property) ?? property
}

export function getPropertyFieldKind(property: string, value: unknown): PropertyFieldKind {
  const leaf = propertyLeaf(property)
  if (leaf === 'grid') {
    return typeof value === 'boolean' ? 'boolean' : 'number'
  }
  if (leaf === 'format') {
    return 'string'
  }
  if (JSON_PROPERTIES.has(property) || (value != null && typeof value === 'object' && !property.includes('.'))) {
    return 'json'
  }
  if (property === 'ylegend.position' || property === 'xlegend.position' || enumNameForProperty(leaf)) {
    return 'enum'
  }
  if (BOOLEAN_PROPERTIES.has(leaf)) {
    return 'boolean'
  }
  if (NUMBER_PROPERTIES.has(leaf) || typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  return 'string'
}

const Y_LEGEND_POSITIONS = ['left', 'right'] as const
const X_LEGEND_POSITIONS = ['bottom', 'top'] as const

export function getPropertyEnumValues(property: string): readonly string[] | null {
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

export function enumPropertyDefault(element: DrawElement, property: string): string | undefined {
  const value = getPropertyDefault(element.type, property)
  return value == null ? undefined : String(value)
}

export function getEnumPropertyDisplayValue(element: DrawElement, property: string, value: unknown): string {
  if (value == null || value === '') {
    return enumPropertyDefault(element, property) ?? ''
  }
  return String(value)
}

export function isMultilineStringProperty(property: string): boolean {
  return MULTILINE_STRING_PROPERTIES.has(property)
}

export function getPropertyLabel(element: DrawElement, property: string): string {
  if (BOOLEAN_PROPERTIES.has(propertyLeaf(property)) || property.includes('.')) {
    return getPropertyDescription(element.type, property)
  }
  return property
}

export function getPropertyTooltip(element: DrawElement, property: string): string | undefined {
  if (BOOLEAN_PROPERTIES.has(propertyLeaf(property))) {
    return property
  }
  return getPropertyDescription(element.type, property)
}

const HEX_COLOR = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/

export function isCodeLikeStringValue(value: unknown): boolean {
  if (value == null || value === '') {
    return false
  }
  if (typeof value !== 'string') {
    return false
  }
  if (hasTemplateSyntax(value)) {
    return true
  }
  if (value.includes('\n')) {
    return true
  }
  if (HEX_COLOR.test(value)) {
    return true
  }
  return false
}

/** Enum fields use a dropdown only for known preset values; templates/hex use a textarea. */
export function shouldUseEnumDropdown(
  _property: string,
  value: unknown,
  enumValues: readonly string[] | null,
): boolean {
  if (!enumValues) {
    return false
  }
  if (isCodeLikeStringValue(value)) {
    return false
  }
  const raw = value == null || value === '' ? '' : String(value)
  if (!raw) {
    return true
  }
  return enumValues.includes(raw)
}

export function isFontProperty(property: string): boolean {
  return property === 'font'
}

export function isImageUrlProperty(property: string, elementType: DrawElement['type']): boolean {
  return property === 'url' && elementType === 'dlimg'
}

export function isIconNameProperty(property: string, elementType: DrawElement['type']): boolean {
  return property === 'value' && elementType === 'icon'
}

export function getEditableProperties(element: DrawElement): string[] {
  return getVisibleProperties(element)
}

export function getSharedEditableProperties(elements: DrawElement[]): string[] {
  if (elements.length === 0) {
    return []
  }
  const [first, ...rest] = elements
  let shared = new Set(getEditableProperties(first!))
  for (const element of rest) {
    const keys = new Set(getEditableProperties(element))
    shared = new Set([...shared].filter((key) => keys.has(key)))
  }
  return [...shared]
}

export function isSharedPropertyValueMixed(elements: DrawElement[], property: string): boolean {
  if (elements.length <= 1) {
    return false
  }
  const baseline = formatPropertyValue(getPropertyEffectiveValue(elements[0]!, property))
  return elements.some(
    (element) => formatPropertyValue(getPropertyEffectiveValue(element, property)) !== baseline,
  )
}

export function parsePropertyInput(
  kind: PropertyFieldKind,
  raw: string,
): string | number | boolean | unknown[] | Record<string, unknown> | null | undefined {
  if (kind === 'json') {
    const trimmed = raw.trim()
    if (!trimmed) {
      return undefined
    }
    return JSON.parse(trimmed) as unknown[] | Record<string, unknown>
  }
  if (kind === 'number') {
    const trimmed = raw.trim()
    if (!trimmed) {
      return undefined
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (kind === 'boolean') {
    return raw === 'true' || raw === 'True'
  }
  if (kind === 'enum') {
    const trimmed = raw.trim()
    return trimmed || undefined
  }
  return raw
}

export function parseNumberPropertyValue(
  element: DrawElement,
  property: string,
  raw: string,
): number | undefined {
  const parsed = parsePropertyInput('number', raw)
  if (typeof parsed !== 'number') {
    return undefined
  }

  let next = parsed
  if (isNonNegativeNumberProperty(property)) {
    next = Math.max(0, next)
  }
  if (isClampedPercentProperty(property)) {
    next = Math.min(100, Math.max(0, next))
  }
  if (isPositionNumberProperty(property)) {
    next = roundPositionNumber(property, next)
  }
  return clampNumberPropertyForElement(element, property, next)
}

export function storedPropertyValueUnchanged(
  element: DrawElement,
  property: string,
  value: unknown,
): boolean {
  const stored = (element as Record<string, unknown>)[property]
  if (value === undefined) {
    return stored === undefined
  }
  return stored === value
}

export { getPropertyEffectiveValue, normalizePropertyValueForStorage }

export function formatPropertyValue(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

export function coerceBooleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 'True'
}

export function booleanPropertyDefault(element: DrawElement, property: string): boolean {
  const value = getPropertyDefault(element.type, property)
  if (typeof value === 'boolean') {
    return value
  }
  return false
}

export function getBooleanPropertyValue(element: DrawElement, property: string, value: unknown): boolean {
  if (value === undefined || value === null) {
    return booleanPropertyDefault(element, property)
  }
  return coerceBooleanValue(value)
}
