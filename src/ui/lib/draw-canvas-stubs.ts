import { getCanvasTextDrawStyle } from '../../core/renderer/text-anchor-draw'
import type { CanvasPrimitive } from '../../core/renderer/types'
import { drawDlimgToCanvas } from './dlimg-resize'
import { resolveCanvasFontFamily } from './load-font-faces'

export function drawCanvasStub(
  ctx: CanvasRenderingContext2D,
  primitive: CanvasPrimitive,
  assetImages: ReadonlyMap<string, HTMLImageElement> = new Map(),
  fontFamilies: ReadonlyMap<string, string> = new Map(),
): void {
  switch (primitive.kind) {
    case 'text-stub': {
      ctx.fillStyle = primitive.color
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.setLineDash([])
      ctx.font = `${primitive.fontSize}px ${resolveCanvasFontFamily(primitive.font, fontFamilies)}, sans-serif`
      const { textAlign, textBaseline } = getCanvasTextDrawStyle(primitive.anchor)
      ctx.textAlign = textAlign
      ctx.textBaseline = textBaseline
      ctx.fillText(primitive.value, primitive.anchorX, primitive.anchorY)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      break
    }
    case 'multiline-stub': {
      ctx.fillStyle = primitive.color
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.setLineDash([])
      ctx.font = `${primitive.fontSize}px ${resolveCanvasFontFamily(primitive.font, fontFamilies)}, sans-serif`
      primitive.lines.forEach((line, index) => {
        const lineHeight = primitive.fontSize + (primitive.lineSpacing ?? 4)
        ctx.fillText(line, primitive.x + 2, primitive.y + primitive.fontSize + index * lineHeight)
      })
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
