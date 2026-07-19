import type { DrawElement } from '../schema/elements'
import { PLOT_DATA_PREVIEW, resolveJsonFieldValue } from '../schema/propertyEditorMeta'
import { resolveBounds } from './bounds'
import {
  effectiveBool,
  effectiveFontSize,
  effectiveNumber,
  effectiveString,
} from './element-defaults'
import { fontUnavailableMessage, getFont } from './fonts'
import { generateSampleSeriesValues, resolvePlotValueRange } from './plot-sample-data'
import type {
  PlotAxisLine,
  PlotAxisTick,
  PlotGridLine,
  PlotLegendLabel,
  PlotSeriesPrimitive,
  RenderContext,
  RenderResult,
} from './types'
import { isVisible } from './visibility'

type PlotElement = Extract<DrawElement, { type: 'plot' }>
type PlotLegend = NonNullable<PlotElement['ylegend']>
type PlotAxis = NonNullable<PlotElement['yaxis']>
type PlotDataLine = PlotElement['data'] extends (infer T)[] | string ? T : never

function plotDataLines(element: PlotElement): PlotDataLine[] {
  return resolveJsonFieldValue(element.data, [...PLOT_DATA_PREVIEW]) as PlotDataLine[]
}

const DEFAULT_POINT_COUNT = 24
const DEFAULT_LEGEND_FONT_SIZE = 10
const Y_LEGEND_WIDTH = 28
const X_LEGEND_HEIGHT = 16
const DEFAULT_Y_TICK_LENGTH = 4

function plotLineNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalPlotBound(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readNestedRecord(
  record: PlotLegend | PlotAxis | undefined,
  key: string,
): unknown {
  if (!record || typeof record !== 'object') {
    return undefined
  }
  return (record as Record<string, unknown>)[key]
}

function effectiveAxisNumber(
  axis: PlotAxis | undefined,
  key: string,
  fallback: number,
  minimum?: number,
): number {
  const value = readNestedRecord(axis, key)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const resolved = value
    return minimum !== undefined ? Math.max(minimum, resolved) : resolved
  }
  return fallback
}

function effectiveAxisColorName(
  axis: PlotAxis | undefined,
  key: string,
  fallback: string,
): string {
  const value = readNestedRecord(axis, key)
  return typeof value === 'string' ? value : fallback
}

function resolveGridDivisions(grid: unknown): number {
  if (grid === false || grid === 0) {
    return 0
  }
  if (typeof grid === 'number' && Number.isFinite(grid) && grid > 0) {
    return Math.round(grid)
  }
  return 5
}

function formatTimeLabel(secondsFromStart: number, format: string): string {
  const date = new Date(secondsFromStart * 1000)
  if (format === '%H:%M') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  }
  return String(Math.round(secondsFromStart))
}

function buildChartLayout(
  bounds: { x: number; y: number; width: number; height: number },
  yLegendPosition: string,
  xLegendPosition: string,
): { chartX: number; chartY: number; chartWidth: number; chartHeight: number } {
  const reserveY = yLegendPosition === 'right' ? 0 : Y_LEGEND_WIDTH
  const reserveX = xLegendPosition === 'top' ? X_LEGEND_HEIGHT : X_LEGEND_HEIGHT
  const chartX = bounds.x + reserveY
  const chartY = bounds.y + (xLegendPosition === 'top' ? reserveX : 0)
  const chartWidth = Math.max(8, bounds.width - reserveY - 4)
  const chartHeight = Math.max(8, bounds.height - reserveX - 4)

  return { chartX, chartY, chartWidth, chartHeight }
}

function valueToChartY(
  value: number,
  low: number,
  high: number,
  chartY: number,
  chartHeight: number,
): number {
  const span = Math.max(high - low, 0.0001)
  const ratio = (value - low) / span
  return chartY + chartHeight - ratio * chartHeight
}

function indexToChartX(index: number, pointCount: number, chartX: number, chartWidth: number): number {
  if (pointCount <= 1) {
    return chartX + chartWidth / 2
  }
  return chartX + (index / (pointCount - 1)) * chartWidth
}

function buildSeries(
  element: PlotElement,
  chartX: number,
  chartY: number,
  chartWidth: number,
  chartHeight: number,
  low: number,
  high: number,
): PlotSeriesPrimitive[] {
  const pointCount = Math.max(8, Math.min(DEFAULT_POINT_COUNT, Math.round(chartWidth / 8)))

  return plotDataLines(element).map((line, seriesIndex) => {
    const values = generateSampleSeriesValues(line.entity, seriesIndex, pointCount, low, high)
    const scale =
      typeof line.value_scale === 'number' && Number.isFinite(line.value_scale)
        ? line.value_scale
        : 1
    const mid = (low + high) / 2
    const points: [number, number][] = values.map((value, index) => [
      indexToChartX(index, pointCount, chartX, chartWidth),
      valueToChartY(mid + (value - mid) * scale, low, high, chartY, chartHeight),
    ])

    return {
      entity: line.entity,
      color: line.color ?? 'black',
      lineWidth: Math.max(1, plotLineNumber(line.width, 1)),
      points,
      smooth: line.smooth === true,
      lineStyle: line.line_style === 'step' ? 'step' : 'linear',
      showPoints: line.show_points === true,
      pointSize: Math.max(1, plotLineNumber(line.point_size, 3)),
      pointColor: line.point_color ?? 'black',
    }
  })
}

function buildGridLines(
  chartX: number,
  chartY: number,
  chartWidth: number,
  chartHeight: number,
  yDivisions: number,
  xdivisions: number,
  color: string,
  style: string,
): PlotGridLine[] {
  const lines: PlotGridLine[] = []
  if (yDivisions > 0) {
    for (let index = 1; index < yDivisions; index++) {
      const y = chartY + (index / yDivisions) * chartHeight
      lines.push({ x1: chartX, y1: y, x2: chartX + chartWidth, y2: y, color, style })
    }
  }
  if (xdivisions > 0) {
    for (let index = 1; index < xdivisions; index++) {
      const x = chartX + (index / xdivisions) * chartWidth
      lines.push({ x1: x, y1: chartY, x2: x, y2: chartY + chartHeight, color, style })
    }
  }
  return lines
}

function legendFontSize(legend: PlotLegend | undefined, element: PlotElement): number {
  if (typeof legend?.size === 'number' && Number.isFinite(legend.size)) {
    return Math.max(1, Math.round(legend.size))
  }
  return effectiveFontSize(element, 'size', DEFAULT_LEGEND_FONT_SIZE)
}

function formatAxisValue(value: number, roundValues: boolean): string {
  if (roundValues) {
    return String(Math.round(value))
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function buildYLegendLabels(
  low: number,
  high: number,
  chartX: number,
  chartY: number,
  chartHeight: number,
  tickEvery: number,
  position: string,
  color: string,
  fontSize: number,
  roundValues: boolean,
): PlotLegendLabel[] {
  const labels: PlotLegendLabel[] = []
  const span = high - low
  const step = tickEvery > 0 ? tickEvery : span / 5
  const start = Math.ceil(low / step) * step

  for (let value = start; value <= high + step * 0.01; value += step) {
    const y = valueToChartY(value, low, high, chartY, chartHeight)
    labels.push({
      text: formatAxisValue(value, roundValues),
      x: position === 'right' ? chartX + 4 : chartX - 24,
      y: y + 3,
      color,
      fontSize,
    })
  }

  return labels
}

function buildXLegendLabels(
  duration: number,
  interval: number,
  chartX: number,
  chartY: number,
  chartWidth: number,
  chartHeight: number,
  format: string,
  position: string,
  color: string,
  fontSize: number,
): PlotLegendLabel[] {
  const labels: PlotLegendLabel[] = []
  const step = interval > 0 ? interval : duration / 5
  const labelY = position === 'top' ? chartY - 4 : chartY + chartHeight + 12

  for (let seconds = 0; seconds <= duration; seconds += step) {
    const ratio = duration > 0 ? seconds / duration : 0
    labels.push({
      text: formatTimeLabel(seconds, format),
      x: chartX + ratio * chartWidth - 12,
      y: labelY,
      color,
      fontSize,
    })
  }

  return labels
}

function buildYAxisTicks(
  labels: readonly PlotLegendLabel[],
  chartX: number,
  color: string,
  tickWidth: number,
  tickLength = DEFAULT_Y_TICK_LENGTH,
): PlotAxisTick[] {
  return labels.map((label) => ({
    x1: chartX - tickLength,
    y1: label.y - 3,
    x2: chartX,
    y2: label.y - 3,
    color,
    lineWidth: tickWidth,
  }))
}

function buildXAxisTicks(
  labels: readonly PlotLegendLabel[],
  chartY: number,
  chartHeight: number,
  color: string,
  tickWidth: number,
  tickLength: number,
): PlotAxisTick[] {
  const axisY = chartY + chartHeight
  return labels.map((label) => ({
    x1: label.x + 12,
    y1: axisY,
    x2: label.x + 12,
    y2: axisY + tickLength,
    color,
    lineWidth: tickWidth,
  }))
}

export function renderPlot(element: PlotElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const bounds = resolveBounds(
    element.x_start ?? 0,
    element.x_end ?? ctx.width,
    element.y_start ?? 0,
    element.y_end ?? ctx.height,
    ctx,
  )

  const yLegendPosition =
    typeof element.ylegend?.position === 'string' ? element.ylegend.position : 'left'
  const xLegendPosition =
    typeof element.xlegend?.position === 'string' ? element.xlegend.position : 'bottom'

  const { chartX, chartY, chartWidth, chartHeight } = buildChartLayout(
    bounds,
    yLegendPosition,
    xLegendPosition,
  )

  const dataLines = plotDataLines(element)
  const previewValues = dataLines.flatMap((line, index) =>
    generateSampleSeriesValues(line.entity, index, DEFAULT_POINT_COUNT, 0, 1),
  )
  const range = resolvePlotValueRange(
    optionalPlotBound(element.low),
    optionalPlotBound(element.high),
    previewValues,
  )
  const roundValues = element.round_values === true
  const low = roundValues ? Math.floor(range.low) : range.low
  const high = roundValues ? Math.ceil(range.high) : range.high
  const legendFont = effectiveString(element, 'font', 'ppb.ttf')
  if (!getFont(legendFont)) {
    // Unlike text/multiline, plot never needed a real opentype.Font object
    // for its own layout — legend/tick label positions are computed from
    // chart geometry, not glyph metrics, and painting happens via a CSS
    // font-family fallback at the UI layer. That meant a confirmed-missing
    // font was previously silently ignored: the whole chart kept rendering
    // fine, just with labels in a fallback font — "plausible but wrong" per
    // the maintainer's ruling (issue #53 follow-up). The font always
    // affects this element (legend/tick labels have no show/hide toggle),
    // so replace the WHOLE chart with the render-error marker, exactly like
    // text/multiline, rather than inventing a "partial error" presentation
    // for just the labels.
    const unavailableMessage = fontUnavailableMessage(legendFont)
    if (unavailableMessage) {
      throw new Error(unavailableMessage)
    }
  }
  const yLegendFontSize = legendFontSize(element.ylegend, element)
  const xLegendFontSize = legendFontSize(element.xlegend, element)

  const yAxisColor = effectiveAxisColorName(element.yaxis, 'color', 'black')
  const xAxisColor = effectiveAxisColorName(element.xaxis, 'color', 'black')
  const yAxisWidth = effectiveAxisNumber(element.yaxis, 'width', 1, 0)
  const xAxisWidth = effectiveAxisNumber(element.xaxis, 'width', 1, 0)
  const yGridDivisions = resolveGridDivisions(readNestedRecord(element.yaxis, 'grid'))
  const xGridDivisions = resolveGridDivisions(readNestedRecord(element.xaxis, 'grid'))
  const yGridColor = effectiveAxisColorName(element.yaxis, 'grid_color', 'black')
  const xGridColor = effectiveAxisColorName(element.xaxis, 'grid_color', 'black')
  const yGridStyle =
    typeof element.yaxis?.grid_style === 'string' ? element.yaxis.grid_style : 'dotted'
  const xGridStyle =
    typeof element.xaxis?.grid_style === 'string' ? element.xaxis.grid_style : 'dotted'

  const axes: { y: PlotAxisLine; x: PlotAxisLine } = {
    y: {
      x1: chartX,
      y1: chartY,
      x2: chartX,
      y2: chartY + chartHeight,
      color: yAxisColor,
      lineWidth: yAxisWidth,
    },
    x: {
      x1: chartX,
      y1: chartY + chartHeight,
      x2: chartX + chartWidth,
      y2: chartY + chartHeight,
      color: xAxisColor,
      lineWidth: xAxisWidth,
    },
  }

  const gridLines = [
    ...buildGridLines(
      chartX,
      chartY,
      chartWidth,
      chartHeight,
      yGridDivisions,
      0,
      yGridColor,
      yGridStyle,
    ),
    ...buildGridLines(
      chartX,
      chartY,
      chartWidth,
      chartHeight,
      0,
      xGridDivisions,
      xGridColor,
      xGridStyle,
    ),
  ]

  const yLegendColor = element.ylegend?.color ?? 'black'
  const xLegendColor = element.xlegend?.color ?? 'black'

  const yLegendLabels = buildYLegendLabels(
    low,
    high,
    chartX,
    chartY,
    chartHeight,
    effectiveAxisNumber(element.yaxis, 'tick_every', 1),
    yLegendPosition,
    yLegendColor,
    yLegendFontSize,
    roundValues,
  )

  const xLegendLabels = buildXLegendLabels(
    effectiveNumber(element, 'duration', 86400, 1),
    typeof element.xlegend?.interval === 'number' ? element.xlegend.interval : 3600,
    chartX,
    chartY,
    chartWidth,
    chartHeight,
    typeof element.xlegend?.format === 'string' ? element.xlegend.format : '%H:%M',
    xLegendPosition,
    xLegendColor,
    xLegendFontSize,
  )

  const yAxisTicks = buildYAxisTicks(
    yLegendLabels,
    chartX,
    yAxisColor,
    effectiveAxisNumber(element.yaxis, 'tick_width', 2, 1),
  )
  const xAxisTicks = buildXAxisTicks(
    xLegendLabels,
    chartY,
    chartHeight,
    xAxisColor,
    effectiveAxisNumber(element.xaxis, 'tick_width', 2, 1),
    effectiveAxisNumber(element.xaxis, 'tick_length', 4, 1),
  )

  const series = buildSeries(element, chartX, chartY, chartWidth, chartHeight, low, high)

  return {
    layer: 'canvas',
    primitive: {
      kind: 'plot',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      chartX,
      chartY,
      chartWidth,
      chartHeight,
      axes,
      gridLines,
      yAxisTicks,
      xAxisTicks,
      yLegendLabels,
      xLegendLabels,
      series,
      legendFont,
      debug: effectiveBool(element, 'debug', false),
    },
  }
}
