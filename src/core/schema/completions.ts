import {
  COLOR_ALIASES,
  CORNERS_OPTIONS,
  DIRECTION_OPTIONS,
  GRID_STYLE_OPTIONS,
  LINE_STYLE_OPTIONS,
  RESIZE_METHOD_OPTIONS,
} from './common'
import { DRAW_ELEMENT_TYPES } from './elements'
import { getPropertyDescription, isRequiredProperty } from './propertyMetadata'
import { SERVICE_OPTION_KEYS } from './service'

export type CompletionKind = 'type' | 'property' | 'enum' | 'service'

export interface CompletionEntry {
  label: string
  kind: CompletionKind
  detail?: string
  enumValues?: readonly string[]
}

/** Property keys per element type (excluding `type`). */
export const PROPERTIES_BY_TYPE: Record<(typeof DRAW_ELEMENT_TYPES)[number], readonly string[]> = {
  debug_grid: [
    'spacing',
    'line_color',
    'dashed',
    'dash_length',
    'space_length',
    'show_labels',
    'label_step',
    'label_color',
    'label_font_size',
    'font',
  ],
  text: [
    'value',
    'x',
    'y',
    'size',
    'font',
    'color',
    'anchor',
    'max_width',
    'spacing',
    'stroke_width',
    'stroke_fill',
    'y_padding',
    'visible',
    'parse_colors',
    'truncate',
  ],
  multiline: [
    'value',
    'delimiter',
    'x',
    'offset_y',
    'y',
    'size',
    'font',
    'color',
    'spacing',
    'visible',
    'parse_colors',
  ],
  line: [
    'x_start',
    'x_end',
    'y_start',
    'y_end',
    'fill',
    'width',
    'y_padding',
    'dashed',
    'dash_length',
    'space_length',
    'visible',
  ],
  rectangle: [
    'x_start',
    'x_end',
    'y_start',
    'y_end',
    'fill',
    'outline',
    'width',
    'radius',
    'corners',
    'visible',
  ],
  rectangle_pattern: [
    'x_start',
    'x_size',
    'x_offset',
    'y_start',
    'y_size',
    'y_offset',
    'x_repeat',
    'y_repeat',
    'fill',
    'outline',
    'width',
    'visible',
  ],
  polygon: ['points', 'fill', 'outline', 'width'],
  circle: ['x', 'y', 'radius', 'fill', 'outline', 'width', 'visible'],
  ellipse: ['x_start', 'x_end', 'y_start', 'y_end', 'fill', 'outline', 'width', 'visible'],
  arc: ['x', 'y', 'radius', 'start_angle', 'end_angle', 'fill', 'outline', 'width'],
  icon: ['value', 'x', 'y', 'size', 'fill', 'anchor', 'visible'],
  icon_sequence: ['x', 'y', 'icons', 'size', 'direction', 'spacing', 'fill', 'anchor', 'visible'],
  dlimg: ['url', 'x', 'y', 'xsize', 'ysize', 'resize_method', 'rotate', 'visible'],
  qrcode: ['data', 'x', 'y', 'boxsize', 'border', 'color', 'bgcolor', 'visible'],
  plot: [
    'data',
    'ylegend',
    'yaxis',
    'xlegend',
    'xaxis',
    'x_start',
    'y_start',
    'x_end',
    'y_end',
    'duration',
    'low',
    'high',
    'font',
    'round_values',
    'size',
    'debug',
    'visible',
  ],
  progress_bar: [
    'x_start',
    'y_start',
    'x_end',
    'y_end',
    'progress',
    'direction',
    'background',
    'fill',
    'outline',
    'width',
    'show_percentage',
    'font',
    'visible',
  ],
}

/** Pillow text/icon anchors (horizontal: l/m/r × vertical: t/a/m/b/d). */
export const ANCHOR_VALUES = [
  'lt',
  'la',
  'lm',
  'lb',
  'ld',
  'mt',
  'ma',
  'mm',
  'mb',
  'md',
  'rt',
  'ra',
  'rm',
  'rb',
  'rd',
] as const

export const ENUMS = {
  color: COLOR_ALIASES,
  anchor: ANCHOR_VALUES,
  direction: DIRECTION_OPTIONS,
  resize_method: RESIZE_METHOD_OPTIONS,
  line_style: LINE_STYLE_OPTIONS,
  grid_style: GRID_STYLE_OPTIONS,
  corners: CORNERS_OPTIONS,
  dither: ['0', '1', '2'] as const,
  dry_run: ['true', 'false', 'True', 'False'] as const,
} as const

export function getElementTypeCompletions(): CompletionEntry[] {
  return DRAW_ELEMENT_TYPES.map((type) => ({
    label: type,
    kind: 'type' as const,
    detail: 'draw element type',
  }))
}

export function getPropertyCompletions(elementType: (typeof DRAW_ELEMENT_TYPES)[number]): CompletionEntry[] {
  return PROPERTIES_BY_TYPE[elementType].map((property) => ({
    label: property,
    kind: 'property' as const,
    detail: isRequiredProperty(elementType, property)
      ? 'required'
      : getPropertyDescription(elementType, property),
  }))
}

export function getServiceOptionCompletions(): CompletionEntry[] {
  return SERVICE_OPTION_KEYS.map((key) => ({
    label: key,
    kind: 'service' as const,
  }))
}

export function getEnumCompletions(enumName: keyof typeof ENUMS): CompletionEntry[] {
  return ENUMS[enumName].map((value) => ({
    label: String(value),
    kind: 'enum' as const,
    detail: enumName,
  }))
}
