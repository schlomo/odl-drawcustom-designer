import { z } from 'zod'
import {
  anchorSchema,
  boolSchema,
  colorSchema,
  coordinateSchema,
  numericTemplateSchema,
  cornersSchema,
  directionSchema,
  fontSchema,
  gridStyleSchema,
  lineStyleSchema,
  resizeMethodSchema,
  spanGapsSchema,
  visibleSchema,
} from './common'
import { iconNameSchema } from './iconName'

const debugGridSchema = z
  .object({
    type: z.literal('debug_grid'),
    spacing: z.number().optional(),
    line_color: colorSchema.optional(),
    dashed: boolSchema.optional(),
    dash_length: z.number().optional(),
    space_length: z.number().optional(),
    show_labels: boolSchema.optional(),
    label_step: z.number().optional(),
    label_color: colorSchema.optional(),
    label_font_size: z.number().optional(),
    font: fontSchema,
    visible: visibleSchema,
  })
  .strict()

const textSchema = z
  .object({
    type: z.literal('text'),
    value: z.string(),
    x: coordinateSchema,
    y: coordinateSchema.optional(),
    size: z.number().optional(),
    font: fontSchema,
    color: colorSchema.optional(),
    anchor: anchorSchema,
    max_width: coordinateSchema.optional(),
    spacing: z.number().optional(),
    stroke_width: z.number().optional(),
    stroke_fill: colorSchema.optional(),
    y_padding: z.number().optional(),
    visible: visibleSchema,
    parse_colors: boolSchema.optional(),
    truncate: boolSchema.optional(),
  })
  .strict()

const multilineSchema = z
  .object({
    type: z.literal('multiline'),
    value: z.string(),
    delimiter: z.string().min(1),
    x: coordinateSchema,
    offset_y: z.number(),
    y: coordinateSchema.optional(),
    size: z.number().optional(),
    font: fontSchema,
    color: colorSchema.optional(),
    spacing: z.number().optional(),
    visible: visibleSchema,
    parse_colors: boolSchema.optional(),
  })
  .strict()

const lineSchema = z
  .object({
    type: z.literal('line'),
    x_start: coordinateSchema,
    x_end: coordinateSchema,
    y_start: coordinateSchema.optional(),
    y_end: coordinateSchema.optional(),
    fill: colorSchema.optional(),
    width: z.number().optional(),
    y_padding: z.number().optional(),
    dashed: boolSchema.optional(),
    dash_length: z.number().optional(),
    space_length: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const rectangleSchema = z
  .object({
    type: z.literal('rectangle'),
    x_start: coordinateSchema,
    x_end: coordinateSchema,
    y_start: coordinateSchema,
    y_end: coordinateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    radius: z.number().optional(),
    corners: cornersSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const rectanglePatternSchema = z
  .object({
    type: z.literal('rectangle_pattern'),
    x_start: coordinateSchema,
    x_size: z.number(),
    x_offset: z.number(),
    y_start: coordinateSchema,
    y_size: z.number(),
    y_offset: z.number(),
    x_repeat: z.number().int(),
    y_repeat: z.number().int(),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const polygonSchema = z
  .object({
    type: z.literal('polygon'),
    points: z.array(z.tuple([z.number(), z.number()])),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const circleSchema = z
  .object({
    type: z.literal('circle'),
    x: coordinateSchema,
    y: coordinateSchema,
    radius: z.number(),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const ellipseSchema = z
  .object({
    type: z.literal('ellipse'),
    x_start: coordinateSchema,
    x_end: coordinateSchema,
    y_start: coordinateSchema,
    y_end: coordinateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const arcSchema = z
  .object({
    type: z.literal('arc'),
    x: coordinateSchema,
    y: coordinateSchema,
    radius: z.number(),
    start_angle: z.number(),
    end_angle: z.number(),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const iconSchema = z
  .object({
    type: z.literal('icon'),
    value: iconNameSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    size: numericTemplateSchema,
    fill: colorSchema.optional(),
    color: colorSchema.optional(),
    anchor: anchorSchema,
    visible: visibleSchema,
  })
  .strict()

const iconSequenceSchema = z
  .object({
    type: z.literal('icon_sequence'),
    x: coordinateSchema,
    y: coordinateSchema,
    icons: z.array(iconNameSchema).min(1),
    size: numericTemplateSchema,
    direction: directionSchema.optional(),
    spacing: z.number().optional(),
    fill: colorSchema.optional(),
    anchor: anchorSchema,
    visible: visibleSchema,
  })
  .strict()

const dlimgSchema = z
  .object({
    type: z.literal('dlimg'),
    url: z.string(),
    x: z.number(),
    y: z.number(),
    xsize: z.number(),
    ysize: z.number(),
    resize_method: resizeMethodSchema.optional(),
    rotate: z.number().optional(),
    visible: visibleSchema,
  })
  .strict()

const qrcodeSchema = z
  .object({
    type: z.literal('qrcode'),
    data: z.string(),
    x: coordinateSchema,
    y: coordinateSchema,
    boxsize: z.number().optional(),
    border: z.number().optional(),
    color: colorSchema.optional(),
    bgcolor: colorSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const plotDataLineSchema = z
  .object({
    entity: z.string(),
    color: colorSchema.optional(),
    width: z.number().optional(),
    span_gaps: spanGapsSchema.optional(),
    smooth: boolSchema.optional(),
    line_style: lineStyleSchema.optional(),
    show_points: boolSchema.optional(),
    point_size: z.number().optional(),
    point_color: colorSchema.optional(),
    value_scale: z.number().optional(),
  })
  .strict()

const plotLegendSchema = z
  .object({
    width: z.number().optional(),
    color: colorSchema.optional(),
    position: z.string().optional(),
    size: z.number().optional(),
    format: z.string().optional(),
    interval: z.number().optional(),
    snap_to_hours: boolSchema.optional(),
  })
  .strict()

const plotAxisSchema = z
  .object({
    width: z.number().optional(),
    color: colorSchema.optional(),
    tick_width: z.number().optional(),
    tick_length: z.number().optional(),
    tick_every: z.number().optional(),
    grid: z.union([boolSchema, z.number()]).optional(),
    grid_color: colorSchema.optional(),
    grid_style: gridStyleSchema.optional(),
  })
  .strict()

const plotSchema = z
  .object({
    type: z.literal('plot'),
    data: z.array(plotDataLineSchema).min(1),
    ylegend: plotLegendSchema.optional(),
    yaxis: plotAxisSchema.optional(),
    xlegend: plotLegendSchema.optional(),
    xaxis: plotAxisSchema.optional(),
    x_start: z.number().optional(),
    y_start: z.number().optional(),
    x_end: z.number().optional(),
    y_end: z.number().optional(),
    duration: z.number().optional(),
    low: z.number().optional(),
    high: z.number().optional(),
    font: fontSchema,
    round_values: boolSchema.optional(),
    size: z.number().optional(),
    debug: boolSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const progressBarSchema = z
  .object({
    type: z.literal('progress_bar'),
    x_start: coordinateSchema,
    y_start: coordinateSchema,
    x_end: coordinateSchema,
    y_end: coordinateSchema,
    progress: z.number(),
    direction: directionSchema.optional(),
    background: colorSchema.optional(),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: z.number().optional(),
    show_percentage: boolSchema.optional(),
    font: fontSchema,
    visible: visibleSchema,
  })
  .strict()

export const drawElementSchema = z.discriminatedUnion('type', [
  debugGridSchema,
  textSchema,
  multilineSchema,
  lineSchema,
  rectangleSchema,
  rectanglePatternSchema,
  polygonSchema,
  circleSchema,
  ellipseSchema,
  arcSchema,
  iconSchema,
  iconSequenceSchema,
  dlimgSchema,
  qrcodeSchema,
  plotSchema,
  progressBarSchema,
])

export type DrawElement = z.infer<typeof drawElementSchema>

export const DRAW_ELEMENT_TYPES = [
  'debug_grid',
  'text',
  'multiline',
  'line',
  'rectangle',
  'rectangle_pattern',
  'polygon',
  'circle',
  'ellipse',
  'arc',
  'icon',
  'icon_sequence',
  'dlimg',
  'qrcode',
  'plot',
  'progress_bar',
] as const satisfies readonly DrawElement['type'][]

export const elementSchemasByType = {
  debug_grid: debugGridSchema,
  text: textSchema,
  multiline: multilineSchema,
  line: lineSchema,
  rectangle: rectangleSchema,
  rectangle_pattern: rectanglePatternSchema,
  polygon: polygonSchema,
  circle: circleSchema,
  ellipse: ellipseSchema,
  arc: arcSchema,
  icon: iconSchema,
  icon_sequence: iconSequenceSchema,
  dlimg: dlimgSchema,
  qrcode: qrcodeSchema,
  plot: plotSchema,
  progress_bar: progressBarSchema,
} as const
