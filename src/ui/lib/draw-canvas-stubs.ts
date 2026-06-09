import type opentype from 'opentype.js'
import {
  computeOpentypeGlyphPositions,
  DEFAULT_FONT_KEY,
  getCanvasTextDrawStyle,
  getFont,
  paintOptionsFromDrawColor,
  resolvePreviewCanvasPaint,
  type CanvasPlotPrimitive,
  type CanvasPrimitive,
  type PlotSeriesPrimitive,
  type TextDrawLine,
  type TagColorMode,
  type DitherMode,
} from '../../core'
import { drawDlimgToCanvas } from './dlimg-resize'
import { getCachedOpentypeFont } from './load-opentype-fonts'
import { resolveCanvasFontFamily } from './load-font-faces'

export interface CanvasDrawColorContext {
  colorMode: TagColorMode
  ditherMode?: DitherMode
}

function resolveDrawFont(
  fontKey: string | undefined,
  opentypeFonts: ReadonlyMap<string, opentype.Font>,
): opentype.Font | undefined {
  const key = fontKey ?? DEFAULT_FONT_KEY
  return opentypeFonts.get(key) ?? getCachedOpentypeFont(key) ?? getFont(key)
}

function resolveCanvasFill(
  ctx: CanvasRenderingContext2D,
  colorName: string,
  drawColor: CanvasDrawColorContext,
): string | CanvasPattern {
  return resolvePreviewCanvasPaint(ctx, colorName, paintOptionsFromDrawColor(drawColor))
}

function drawOpentypeLine(
  ctx: CanvasRenderingContext2D,
  font: opentype.Font,
  line: TextDrawLine,
  fontSize: number,
  fill: string | CanvasPattern,
): void {
  const positions = computeOpentypeGlyphPositions(font, line.text, fontSize, line.x, line.y)

  for (const { glyph, x, y } of positions) {
    const path = glyph.getPath(x, y, fontSize)
    path.fill = fill as string
    path.draw(ctx)
  }
}

function drawTextLineContent(
  ctx: CanvasRenderingContext2D,
  font: opentype.Font | undefined,
  line: TextDrawLine,
  fontSize: number,
  defaultColor: string,
  drawColor: CanvasDrawColorContext,
  fontFamily: string,
): void {
  if (line.colorSegments != null && line.colorSegments.length > 0) {
    if (font) {
      for (const segment of line.colorSegments) {
        const fill = resolveCanvasFill(ctx, segment.color, drawColor)
        drawOpentypeLine(
          ctx,
          font,
          { ...line, text: segment.text, visualText: segment.visualText, x: segment.x },
          fontSize,
          fill,
        )
      }
      return
    }

    ctx.font = `${fontSize}px ${fontFamily}, sans-serif`
    for (const segment of line.colorSegments) {
      ctx.fillStyle = resolveCanvasFill(ctx, segment.color, drawColor) as string
      ctx.fillText(segment.visualText, segment.x, line.y)
    }
    return
  }

  const fill = resolveCanvasFill(ctx, defaultColor, drawColor)
  if (font) {
    drawOpentypeLine(ctx, font, line, fontSize, fill)
    return
  }

  ctx.fillStyle = fill as string
  ctx.fillText(line.visualText, line.x, line.y)
}

function drawTextFallback(
  ctx: CanvasRenderingContext2D,
  primitive: Extract<CanvasPrimitive, { kind: 'text-stub' }>,
  fontFamilies: ReadonlyMap<string, string>,
  drawColor: CanvasDrawColorContext,
): void {
  ctx.font = `${primitive.fontSize}px ${resolveCanvasFontFamily(primitive.font, fontFamilies)}, sans-serif`
  const { textAlign, textBaseline } = getCanvasTextDrawStyle(primitive.anchor)
  ctx.textAlign = textAlign
  ctx.textBaseline = textBaseline

  if (primitive.drawLines.length > 0) {
    for (const line of primitive.drawLines) {
      ctx.direction = 'ltr'
      drawTextLineContent(
        ctx,
        undefined,
        line,
        primitive.fontSize,
        primitive.defaultColor,
        drawColor,
        resolveCanvasFontFamily(primitive.font, fontFamilies),
      )
    }
  } else {
    ctx.fillStyle = resolveCanvasFill(ctx, primitive.defaultColor, drawColor) as string
    ctx.fillText(primitive.value, primitive.anchorX, primitive.anchorY)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function applyPlotLineDash(ctx: CanvasRenderingContext2D, style: string): void {
  if (style === 'dashed') {
    ctx.setLineDash([4, 3])
    return
  }
  if (style === 'dotted') {
    ctx.setLineDash([1, 2])
    return
  }
  ctx.setLineDash([])
}

function drawPlotSeriesLine(ctx: CanvasRenderingContext2D, series: PlotSeriesPrimitive): void {
  const { points, lineStyle, smooth } = series
  if (points.length < 2) {
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])

  if (lineStyle === 'step') {
    for (let index = 1; index < points.length; index++) {
      const [x, y] = points[index]
      const prevY = points[index - 1][1]
      ctx.lineTo(x, prevY)
      ctx.lineTo(x, y)
    }
  } else if (smooth) {
    for (let index = 1; index < points.length; index++) {
      const [x, y] = points[index]
      const [prevX, prevY] = points[index - 1]
      const midX = (prevX + x) / 2
      const midY = (prevY + y) / 2
      ctx.quadraticCurveTo(prevX, prevY, midX, midY)
      if (index === points.length - 1) {
        ctx.lineTo(x, y)
      }
    }
  } else {
    for (let index = 1; index < points.length; index++) {
      ctx.lineTo(points[index][0], points[index][1])
    }
  }

  ctx.stroke()
}

function drawPlotPrimitive(
  ctx: CanvasRenderingContext2D,
  primitive: CanvasPlotPrimitive,
  fontFamilies: ReadonlyMap<string, string>,
  drawColor: CanvasDrawColorContext,
): void {
  const paintOptions = paintOptionsFromDrawColor(drawColor)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)

  for (const line of primitive.gridLines) {
    ctx.strokeStyle = resolvePreviewCanvasPaint(ctx, line.color, paintOptions) as string
    ctx.lineWidth = 1
    applyPlotLineDash(ctx, line.style)
    ctx.beginPath()
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
    ctx.stroke()
  }
  ctx.setLineDash([])

  for (const axis of [primitive.axes.y, primitive.axes.x]) {
    ctx.strokeStyle = resolvePreviewCanvasPaint(ctx, axis.color, paintOptions) as string
    ctx.lineWidth = axis.lineWidth
    ctx.beginPath()
    ctx.moveTo(axis.x1, axis.y1)
    ctx.lineTo(axis.x2, axis.y2)
    ctx.stroke()
  }

  for (const tick of [...primitive.yAxisTicks, ...primitive.xAxisTicks]) {
    ctx.strokeStyle = resolvePreviewCanvasPaint(ctx, tick.color, paintOptions) as string
    ctx.lineWidth = tick.lineWidth
    ctx.beginPath()
    ctx.moveTo(tick.x1, tick.y1)
    ctx.lineTo(tick.x2, tick.y2)
    ctx.stroke()
  }

  const legendFontFamily = resolveCanvasFontFamily(primitive.legendFont, fontFamilies)
  ctx.textBaseline = 'middle'
  for (const label of primitive.yLegendLabels) {
    ctx.fillStyle = resolvePreviewCanvasPaint(ctx, label.color, paintOptions) as string
    ctx.textAlign = 'right'
    ctx.font = `${label.fontSize}px ${legendFontFamily}, sans-serif`
    ctx.fillText(label.text, label.x + 20, label.y)
  }
  for (const label of primitive.xLegendLabels) {
    ctx.fillStyle = resolvePreviewCanvasPaint(ctx, label.color, paintOptions) as string
    ctx.textAlign = 'left'
    ctx.font = `${label.fontSize}px ${legendFontFamily}, sans-serif`
    ctx.fillText(label.text, label.x, label.y)
  }

  for (const series of primitive.series) {
    ctx.strokeStyle = resolvePreviewCanvasPaint(ctx, series.color, paintOptions) as string
    ctx.lineWidth = series.lineWidth
    drawPlotSeriesLine(ctx, series)

    if (series.showPoints) {
      ctx.fillStyle = resolvePreviewCanvasPaint(ctx, series.pointColor, paintOptions) as string
      for (const [x, y] of series.points) {
        ctx.beginPath()
        ctx.arc(x, y, series.pointSize / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (primitive.debug) {
    ctx.strokeStyle = '#FF00FF'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(primitive.chartX, primitive.chartY, primitive.chartWidth, primitive.chartHeight)
    ctx.setLineDash([])
  }
}

export function drawCanvasStub(
  ctx: CanvasRenderingContext2D,
  primitive: CanvasPrimitive,
  assetImages: ReadonlyMap<string, HTMLImageElement> = new Map(),
  fontFamilies: ReadonlyMap<string, string> = new Map(),
  opentypeFonts: ReadonlyMap<string, opentype.Font> = new Map(),
  drawColor: CanvasDrawColorContext = { colorMode: 'bwr', ditherMode: 0 },
): void {
  switch (primitive.kind) {
    case 'text-stub': {
      const font = resolveDrawFont(primitive.font, opentypeFonts)
      const fontFamily = resolveCanvasFontFamily(primitive.font, fontFamilies)
      if (font) {
        for (const line of primitive.drawLines) {
          drawTextLineContent(
            ctx,
            font,
            line,
            primitive.fontSize,
            primitive.defaultColor,
            drawColor,
            fontFamily,
          )
        }
      } else {
        drawTextFallback(ctx, primitive, fontFamilies, drawColor)
      }
      break
    }
    case 'multiline-stub': {
      const font = resolveDrawFont(primitive.font, opentypeFonts)
      const fontFamily = resolveCanvasFontFamily(primitive.font, fontFamilies)
      if (font) {
        for (const line of primitive.drawLines) {
          drawTextLineContent(
            ctx,
            font,
            line,
            primitive.fontSize,
            primitive.defaultColor,
            drawColor,
            fontFamily,
          )
        }
      } else {
        ctx.font = `${primitive.fontSize}px ${fontFamily}, sans-serif`
        for (const line of primitive.drawLines) {
          drawTextLineContent(
            ctx,
            undefined,
            line,
            primitive.fontSize,
            primitive.defaultColor,
            drawColor,
            fontFamily,
          )
        }
      }
      break
    }
    case 'dlimg-stub': {
      const image = assetImages.get(primitive.url)
      if (image) {
        drawDlimgToCanvas(
          ctx,
          image,
          {
            x: primitive.x,
            y: primitive.y,
            width: primitive.width,
            height: primitive.height,
          },
          primitive.resizeMethod as 'stretch' | 'crop' | 'cover' | 'contain' | undefined,
          { colorMode: drawColor.colorMode, ditherMode: drawColor.ditherMode },
        )
        break
      }

      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.strokeStyle = '#64748b'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 3])
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.setLineDash([])
      ctx.fillStyle = '#334155'
      ctx.font = '11px sans-serif'
      const label = primitive.url.length > 24 ? `${primitive.url.slice(0, 24)}…` : primitive.url
      ctx.fillText(label, primitive.x + 4, primitive.y + 16)
      break
    }
    case 'qrcode': {
      const { boxsize, border, modules, moduleData } = primitive
      const renderedSize = (modules + border * 2) * boxsize
      const paintOptions = paintOptionsFromDrawColor(drawColor)
      ctx.fillStyle = resolvePreviewCanvasPaint(ctx, primitive.bgcolor, paintOptions) as string
      ctx.fillRect(primitive.x, primitive.y, renderedSize, renderedSize)
      ctx.fillStyle = resolvePreviewCanvasPaint(ctx, primitive.color, paintOptions) as string
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          if (moduleData[row * modules + col]) {
            ctx.fillRect(
              primitive.x + (col + border) * boxsize,
              primitive.y + (row + border) * boxsize,
              boxsize,
              boxsize,
            )
          }
        }
      }
      break
    }
    case 'plot': {
      drawPlotPrimitive(ctx, primitive, fontFamilies, drawColor)
      break
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
