import { z } from 'zod'
import { hasTemplateSyntax } from '../templates/patterns'

/** Named color aliases from docs/spec/supported_types.md */
export const COLOR_ALIASES = [
  'white',
  'black',
  'red',
  'yellow',
  'accent',
  'half_black',
  'gray',
  'grey',
  'half_white',
  'half_red',
  'half_yellow',
  'half_accent',
  'b',
  'w',
  'r',
  'y',
  'a',
  'hb',
  'hw',
  'hr',
  'hy',
  'ha',
  'none',
] as const

/** Jinja template strings used for dynamic color (and similar) fields in HA YAML. */
export const jinjaTemplateStringSchema = z.string().refine((value) => hasTemplateSyntax(value))

function enumOrJinjaTemplateSchema<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), jinjaTemplateStringSchema])
}

export const colorSchema = z.union([
  z.enum(COLOR_ALIASES),
  z.string().regex(/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/),
  jinjaTemplateStringSchema,
  z.null(),
])

export const coordinateSchema = z.union([
  z.number(),
  z.string().regex(/^\d+(\.\d+)?%$/),
])

/** Numeric fields that accept HA Jinja templates (e.g. dynamic icon size). */
export const numericTemplateSchema = z.union([z.number(), jinjaTemplateStringSchema])

export const boolSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false', 'True', 'False']),
])

/** Boolean fields that accept HA Jinja templates (e.g. conditional visible). */
export const boolTemplateSchema = z.union([boolSchema, jinjaTemplateStringSchema])

export const visibleSchema = boolTemplateSchema.optional()

/** Cross-cutting fields on all 16 draw types (ADR-012). */
export const CROSS_CUTTING_ELEMENT_FIELDS = ['visible'] as const

export const fontSchema = z.string().optional()

export const anchorSchema = z.string().optional()

export const DIRECTION_OPTIONS = ['right', 'left', 'up', 'down'] as const
export const RESIZE_METHOD_OPTIONS = ['stretch', 'crop', 'cover', 'contain'] as const
export const LINE_STYLE_OPTIONS = ['linear', 'step'] as const
export const GRID_STYLE_OPTIONS = ['dotted', 'dashed', 'lines'] as const

export const directionSchema = enumOrJinjaTemplateSchema(DIRECTION_OPTIONS)

export const resizeMethodSchema = enumOrJinjaTemplateSchema(RESIZE_METHOD_OPTIONS)

export const lineStyleSchema = enumOrJinjaTemplateSchema(LINE_STYLE_OPTIONS)

export const gridStyleSchema = enumOrJinjaTemplateSchema(GRID_STYLE_OPTIONS)

export const CORNERS_OPTIONS = ['all'] as const

export const cornersSchema = z.union([
  z.literal('all'),
  z.string(),
])

export const spanGapsSchema = z.union([boolSchema, z.number()])
