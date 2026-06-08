import type opentype from 'opentype.js'
import { DEFAULT_FONT_KEY, getFont } from '../../core/renderer/fonts'
import { computeOpentypeGlyphPositions } from '../../core/renderer/opentype-glyphs'
import type { TextDrawLine } from '../../core/renderer/types'
import { getCanvasTextDrawStyle } from '../../core/renderer/text-anchor-draw'
import type { CanvasPrimitive } from '../../core/renderer/types'
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
    case 'qrcode-stub': {
      const modules = 8
      const cellW = primitive.width / modules
      const cellH = primitive.height / modules
      ctx.fillStyle = primitive.bgcolor
      ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.fillStyle = primitive.color
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          if ((row + col) % 2 === 0) {
            ctx.fillRect(
              primitive.x + col * cellW,
              primitive.y + row * cellH,
              cellW,
              cellH,
            )
          }
        }
      }
      break
    }
    case 'plot-stub': {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.strokeStyle = '#64748b'
      ctx.lineWidth = 1
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.fillStyle = '#334155'
      ctx.font = '12px sans-serif'
      ctx.fillText(`plot (${primitive.seriesCount} series)`, primitive.x + 8, primitive.y + 20)
      break
    }
    default: {
      const _exhaustive: never = primitive
      return _exhaustive
    }
  }
}
