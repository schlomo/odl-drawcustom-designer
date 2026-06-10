import { z } from 'zod'
import {
  anchorSchema,
  boolTemplateSchema,
  colorSchema,
  coordinateTemplateSchema,
  cornersSchema,
  directionSchema,
  fontSchema,
  gridStyleSchema,
  jsonOrTemplateSchema,
  lineStyleSchema,
  numericTemplateSchema,
  resizeMethodSchema,
  spanGapsSchema,
  visibleSchema,
} from './common'
import { iconNameSchema } from './iconName'

const debugGridSchema = z
  .object({
    type: z.literal('debug_grid'),
    spacing: numericTemplateSchema.optional(),
    line_color: colorSchema.optional(),
    dashed: boolTemplateSchema.optional(),
    dash_length: numericTemplateSchema.optional(),
    space_length: numericTemplateSchema.optional(),
    show_labels: boolTemplateSchema.optional(),
    label_step: numericTemplateSchema.optional(),
    label_color: colorSchema.optional(),
    label_font_size: numericTemplateSchema.optional(),
    font: fontSchema,
    visible: visibleSchema,
  })
  .strict()

const textSchema = z
  .object({
    type: z.literal('text'),
    value: z.string(),
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema.optional(),
    size: numericTemplateSchema.optional(),
    font: fontSchema,
    color: colorSchema.optional(),
    anchor: anchorSchema,
    max_width: coordinateTemplateSchema.optional(),
    spacing: numericTemplateSchema.optional(),
    stroke_width: numericTemplateSchema.optional(),
    stroke_fill: colorSchema.optional(),
    y_padding: numericTemplateSchema.optional(),
    visible: visibleSchema,
    parse_colors: boolTemplateSchema.optional(),
    truncate: boolTemplateSchema.optional(),
  })
  .strict()

const multilineSchema = z
  .object({
    type: z.literal('multiline'),
    value: z.string(),
    delimiter: z.string().min(1),
    x: coordinateTemplateSchema,
    offset_y: numericTemplateSchema,
    y: coordinateTemplateSchema.optional(),
    size: numericTemplateSchema.optional(),
    font: fontSchema,
    color: colorSchema.optional(),
    spacing: numericTemplateSchema.optional(),
    visible: visibleSchema,
    parse_colors: boolTemplateSchema.optional(),
  })
  .strict()

const lineSchema = z
  .object({
    type: z.literal('line'),
    x_start: coordinateTemplateSchema,
    x_end: coordinateTemplateSchema,
    y_start: coordinateTemplateSchema.optional(),
    y_end: coordinateTemplateSchema.optional(),
    fill: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    y_padding: numericTemplateSchema.optional(),
    dashed: boolTemplateSchema.optional(),
    dash_length: numericTemplateSchema.optional(),
    space_length: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const rectangleSchema = z
  .object({
    type: z.literal('rectangle'),
    x_start: coordinateTemplateSchema,
    x_end: coordinateTemplateSchema,
    y_start: coordinateTemplateSchema,
    y_end: coordinateTemplateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    radius: numericTemplateSchema.optional(),
    corners: cornersSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const rectanglePatternSchema = z
  .object({
    type: z.literal('rectangle_pattern'),
    x_start: coordinateTemplateSchema,
    x_size: numericTemplateSchema,
    x_offset: numericTemplateSchema,
    y_start: coordinateTemplateSchema,
    y_size: numericTemplateSchema,
    y_offset: numericTemplateSchema,
    x_repeat: numericTemplateSchema,
    y_repeat: numericTemplateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const polygonPointsSchema = z.array(z.tuple([z.number(), z.number()]))

const polygonSchema = z
  .object({
    type: z.literal('polygon'),
    points: jsonOrTemplateSchema(polygonPointsSchema),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const circleSchema = z
  .object({
    type: z.literal('circle'),
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema,
    radius: numericTemplateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const ellipseSchema = z
  .object({
    type: z.literal('ellipse'),
    x_start: coordinateTemplateSchema,
    x_end: coordinateTemplateSchema,
    y_start: coordinateTemplateSchema,
    y_end: coordinateTemplateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const arcSchema = z
  .object({
    type: z.literal('arc'),
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema,
    radius: numericTemplateSchema,
    start_angle: numericTemplateSchema,
    end_angle: numericTemplateSchema,
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const iconSchema = z
  .object({
    type: z.literal('icon'),
    value: iconNameSchema,
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema,
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
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema,
    icons: jsonOrTemplateSchema(z.array(iconNameSchema).min(1)),
    size: numericTemplateSchema,
    direction: directionSchema.optional(),
    spacing: numericTemplateSchema.optional(),
    fill: colorSchema.optional(),
    anchor: anchorSchema,
    visible: visibleSchema,
  })
  .strict()

const dlimgSchema = z
  .object({
    type: z.literal('dlimg'),
    url: z.string(),
    x: numericTemplateSchema,
    y: numericTemplateSchema,
    xsize: numericTemplateSchema,
    ysize: numericTemplateSchema,
    resize_method: resizeMethodSchema.optional(),
    rotate: numericTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const qrcodeSchema = z
  .object({
    type: z.literal('qrcode'),
    data: z.string(),
    x: coordinateTemplateSchema,
    y: coordinateTemplateSchema,
    boxsize: numericTemplateSchema.optional(),
    border: numericTemplateSchema.optional(),
    color: colorSchema.optional(),
    bgcolor: colorSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const plotDataLineSchema = z
  .object({
    entity: z.string(),
    color: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    span_gaps: spanGapsSchema.optional(),
    smooth: boolTemplateSchema.optional(),
    line_style: lineStyleSchema.optional(),
    show_points: boolTemplateSchema.optional(),
    point_size: numericTemplateSchema.optional(),
    point_color: colorSchema.optional(),
    value_scale: numericTemplateSchema.optional(),
  })
  .strict()

const plotLegendSchema = z
  .object({
    width: numericTemplateSchema.optional(),
    color: colorSchema.optional(),
    position: z.string().optional(),
    size: numericTemplateSchema.optional(),
    format: z.string().optional(),
    interval: numericTemplateSchema.optional(),
    snap_to_hours: boolTemplateSchema.optional(),
  })
  .strict()

const plotAxisSchema = z
  .object({
    width: numericTemplateSchema.optional(),
    color: colorSchema.optional(),
    tick_width: numericTemplateSchema.optional(),
    tick_length: numericTemplateSchema.optional(),
    tick_every: numericTemplateSchema.optional(),
    grid: z.union([boolTemplateSchema, numericTemplateSchema]).optional(),
    grid_color: colorSchema.optional(),
    grid_style: gridStyleSchema.optional(),
  })
  .strict()

const plotSchema = z
  .object({
    type: z.literal('plot'),
    data: jsonOrTemplateSchema(z.array(plotDataLineSchema).min(1)),
    ylegend: plotLegendSchema.optional(),
    yaxis: plotAxisSchema.optional(),
    xlegend: plotLegendSchema.optional(),
    xaxis: plotAxisSchema.optional(),
    x_start: numericTemplateSchema.optional(),
    y_start: numericTemplateSchema.optional(),
    x_end: numericTemplateSchema.optional(),
    y_end: numericTemplateSchema.optional(),
    duration: numericTemplateSchema.optional(),
    low: numericTemplateSchema.optional(),
    high: numericTemplateSchema.optional(),
    font: fontSchema,
    round_values: boolTemplateSchema.optional(),
    size: numericTemplateSchema.optional(),
    debug: boolTemplateSchema.optional(),
    visible: visibleSchema,
  })
  .strict()

const progressBarSchema = z
  .object({
    type: z.literal('progress_bar'),
    x_start: coordinateTemplateSchema,
    y_start: coordinateTemplateSchema,
    x_end: coordinateTemplateSchema,
    y_end: coordinateTemplateSchema,
    progress: numericTemplateSchema,
    direction: directionSchema.optional(),
    background: colorSchema.optional(),
    fill: colorSchema.optional(),
    outline: colorSchema.optional(),
    width: numericTemplateSchema.optional(),
    show_percentage: boolTemplateSchema.optional(),
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
