import type opentype from 'opentype.js'
import { DEFAULT_FONT_KEY, getFont } from '../../core/renderer/fonts'
import { computeOpentypeGlyphPositions } from '../../core/renderer/opentype-glyphs'
import type { TextDrawLine } from '../../core/renderer/types'
import { getCanvasTextDrawStyle } from '../../core/renderer/text-anchor-draw'
import type { CanvasPlotPrimitive, CanvasPrimitive, PlotSeriesPrimitive } from '../../core/renderer/types'
import { drawDlimgToCanvas } from './dlimg-resize'
import { getCachedOpentypeFont } from './load-opentype-fonts'
import { resolveCanvasFontFamily } from './load-font-faces'

function resolveDrawFont(
  fontKey: string | undefined,
  opentypeFonts: ReadonlyMap<string, opentype.Font>,
): opentype.Font | undefined {
  const key = fontKey ?? DEFAULT_FONT_KEY
  return opentypeFonts.get(key) ?? getCachedOpentypeFont(key) ?? getFont(key)
}

function drawOpentypeLine(
  ctx: CanvasRenderingContext2D,
  font: opentype.Font,
  line: TextDrawLine,
  fontSize: number,
  color: string,
): void {
  const positions = computeOpentypeGlyphPositions(font, line.text, fontSize, line.x, line.y)

  for (const { glyph, x, y } of positions) {
    const path = glyph.getPath(x, y, fontSize)
    path.fill = color
    path.draw(ctx)
  }
}

function drawOpentypeLines(
  ctx: CanvasRenderingContext2D,
  font: opentype.Font,
  drawLines: ReadonlyArray<TextDrawLine>,
  fontSize: number,
  color: string,
): void {
  for (const line of drawLines) {
    drawOpentypeLine(ctx, font, line, fontSize, color)
  }
}

function drawTextFallback(
  ctx: CanvasRenderingContext2D,
  primitive: Extract<CanvasPrimitive, { kind: 'text-stub' }>,
  fontFamilies: ReadonlyMap<string, string>,
): void {
  ctx.font = `${primitive.fontSize}px ${resolveCanvasFontFamily(primitive.font, fontFamilies)}, sans-serif`
  const { textAlign, textBaseline } = getCanvasTextDrawStyle(primitive.anchor)
  ctx.textAlign = textAlign
  ctx.textBaseline = textBaseline

  if (primitive.drawLines.length > 0) {
    for (const line of primitive.drawLines) {
      ctx.direction = 'ltr'
      ctx.fillText(line.visualText, line.x, line.y)
    }
  } else {
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
): void {
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)

  for (const line of primitive.gridLines) {
    ctx.strokeStyle = line.color
    ctx.lineWidth = 1
    applyPlotLineDash(ctx, line.style)
    ctx.beginPath()
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
    ctx.stroke()
  }
  ctx.setLineDash([])

  for (const axis of [primitive.axes.y, primitive.axes.x]) {
    ctx.strokeStyle = axis.color
    ctx.lineWidth = axis.lineWidth
    ctx.beginPath()
    ctx.moveTo(axis.x1, axis.y1)
    ctx.lineTo(axis.x2, axis.y2)
    ctx.stroke()
  }

  for (const tick of [...primitive.yAxisTicks, ...primitive.xAxisTicks]) {
    ctx.strokeStyle = tick.color
    ctx.lineWidth = tick.lineWidth
    ctx.beginPath()
    ctx.moveTo(tick.x1, tick.y1)
    ctx.lineTo(tick.x2, tick.y2)
    ctx.stroke()
  }

  const legendFontFamily = resolveCanvasFontFamily(primitive.legendFont, fontFamilies)
  ctx.textBaseline = 'middle'
  for (const label of primitive.yLegendLabels) {
    ctx.fillStyle = label.color
    ctx.textAlign = 'right'
    ctx.font = `${label.fontSize}px ${legendFontFamily}, sans-serif`
    ctx.fillText(label.text, label.x + 20, label.y)
  }
  for (const label of primitive.xLegendLabels) {
    ctx.fillStyle = label.color
    ctx.textAlign = 'left'
    ctx.font = `${label.fontSize}px ${legendFontFamily}, sans-serif`
    ctx.fillText(label.text, label.x, label.y)
  }

  for (const series of primitive.series) {
    ctx.strokeStyle = series.color
    ctx.lineWidth = series.lineWidth
    drawPlotSeriesLine(ctx, series)

    if (series.showPoints) {
      ctx.fillStyle = series.pointColor
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
): void {
  switch (primitive.kind) {
    case 'text-stub': {
      ctx.fillStyle = primitive.color
      const font = resolveDrawFont(primitive.font, opentypeFonts)
      if (font) {
        drawOpentypeLines(ctx, font, primitive.drawLines, primitive.fontSize, primitive.color)
      } else {
        drawTextFallback(ctx, primitive, fontFamilies)
      }
      break
    }
    case 'multiline-stub': {
      ctx.fillStyle = primitive.color
      const font = resolveDrawFont(primitive.font, opentypeFonts)
      if (font) {
        drawOpentypeLines(ctx, font, primitive.drawLines, primitive.fontSize, primitive.color)
      } else {
        ctx.font = `${primitive.fontSize}px ${resolveCanvasFontFamily(primitive.font, fontFamilies)}, sans-serif`
        for (const line of primitive.drawLines) {
          ctx.fillText(line.visualText, line.x, line.y)
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
      ctx.fillStyle = primitive.bgcolor
      ctx.fillRect(primitive.x, primitive.y, renderedSize, renderedSize)
      ctx.fillStyle = primitive.color
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
      drawPlotPrimitive(ctx, primitive, fontFamilies)
      break
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
