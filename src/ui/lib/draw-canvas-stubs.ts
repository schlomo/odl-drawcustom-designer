import type { CanvasPrimitive } from '../../core/renderer/types'

export function drawCanvasStub(
  ctx: CanvasRenderingContext2D,
  primitive: CanvasPrimitive,
): void {
  switch (primitive.kind) {
    case 'text-stub': {
      ctx.fillStyle = primitive.color
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.setLineDash([])
      ctx.font = `${primitive.fontSize}px sans-serif`
      ctx.fillText(primitive.value, primitive.x + 2, primitive.y + primitive.fontSize)
      break
    }
    case 'multiline-stub': {
      ctx.fillStyle = primitive.color
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])
      ctx.strokeRect(primitive.x, primitive.y, primitive.width, primitive.height)
      ctx.setLineDash([])
      ctx.font = `${primitive.fontSize}px sans-serif`
      primitive.lines.forEach((line, index) => {
        const lineHeight = primitive.fontSize + (primitive.lineSpacing ?? 4)
        ctx.fillText(line, primitive.x + 2, primitive.y + primitive.fontSize + index * lineHeight)
      })
      break
    }
    case 'dlimg-stub': {
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
