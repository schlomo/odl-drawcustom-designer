import { z } from 'zod'

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

export const colorSchema = z.union([
  z.enum(COLOR_ALIASES),
  z.string().regex(/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/),
  z.null(),
])

export const coordinateSchema = z.union([
  z.number(),
  z.string().regex(/^\d+(\.\d+)?%$/),
])

export const boolSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false', 'True', 'False']),
])

export const visibleSchema = boolSchema.optional()

export const fontSchema = z.string().optional()

export const anchorSchema = z.string().optional()

export const directionSchema = z.enum(['right', 'left', 'up', 'down'])

export const resizeMethodSchema = z.enum(['stretch', 'crop', 'cover', 'contain'])

export const lineStyleSchema = z.enum(['linear', 'step'])

export const gridStyleSchema = z.enum(['dotted', 'dashed', 'lines'])

export const cornersSchema = z.union([
  z.literal('all'),
  z.string(),
])

export const spanGapsSchema = z.union([boolSchema, z.number()])
