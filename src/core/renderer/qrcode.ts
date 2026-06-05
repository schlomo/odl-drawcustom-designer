import type { DrawElement } from '../schema/elements'
import { mapColor } from './colors'
import { resolveX, resolveY } from './coordinates'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type QrcodeElement = Extract<DrawElement, { type: 'qrcode' }>

const DEFAULT_BOX_SIZE = 10
const DEFAULT_BORDER = 4
const MODULES_PER_SIDE = 21

function estimateQrcodeSize(boxsize: number, border: number): number {
  return (MODULES_PER_SIDE + border * 2) * boxsize
}

export function renderQrcode(element: QrcodeElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const colorOptions = { accentMode: ctx.accentMode }
  const boxsize = element.boxsize ?? DEFAULT_BOX_SIZE
  const border = element.border ?? DEFAULT_BORDER
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
      color: mapColor(element.color ?? 'black', colorOptions) ?? '#000000',
      bgcolor: mapColor(element.bgcolor ?? 'white', colorOptions) ?? '#FFFFFF',
    },
  }
}
