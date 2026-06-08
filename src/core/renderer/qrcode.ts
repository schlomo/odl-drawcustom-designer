import type { DrawElement } from '../schema/elements'
import { effectiveNumber, effectiveString } from './element-defaults'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type QrcodeElement = Extract<DrawElement, { type: 'qrcode' }>

const MODULES_PER_SIDE = 21

function estimateQrcodeSize(boxsize: number, border: number): number {
  return (MODULES_PER_SIDE + border * 2) * boxsize
}

export function renderQrcode(element: QrcodeElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const boxsize = effectiveNumber(element, 'boxsize', 2, 1)
  const border = effectiveNumber(element, 'border', 1, 0)
  const size = estimateQrcodeSize(boxsize, border)

  return {
    layer: 'canvas',
    primitive: {
      kind: 'qrcode-stub',
      x: resolveX(element.x, ctx),
      y: resolveY(element.y, ctx),
      width: size,
      height: size,
      data: element.data,
      color: mapColor(effectiveString(element, 'color', 'black'), colorOptions) ?? '#000000',
      bgcolor: mapColor(effectiveString(element, 'bgcolor', 'white'), colorOptions) ?? '#FFFFFF',
    },
  }
}
