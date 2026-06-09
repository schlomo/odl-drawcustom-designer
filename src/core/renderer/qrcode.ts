import type { DrawElement } from '../schema/elements'
import { effectiveNumber, effectiveString } from './element-defaults'
import { resolveX, resolveY } from './coordinates'
import { createQrModuleGrid, qrRenderedSize } from './qr-modules'
import type { RenderContext, RenderResult } from './types'
import { isVisible } from './visibility'

type QrcodeElement = Extract<DrawElement, { type: 'qrcode' }>

export function renderQrcode(element: QrcodeElement, ctx: RenderContext): RenderResult | null {
  if (!isVisible(element.visible)) {
    return null
  }

  const boxsize = effectiveNumber(element, 'boxsize', 2, 1)
  const border = effectiveNumber(element, 'border', 1, 0)
  const { modules, moduleData } = createQrModuleGrid(element.data)
  const size = qrRenderedSize(modules, boxsize, border)

  return {
    layer: 'canvas',
    primitive: {
      kind: 'qrcode',
      x: resolveX(element.x, ctx),
      y: resolveY(element.y, ctx),
      width: size,
      height: size,
      boxsize,
      border,
      modules,
      moduleData,
      data: element.data,
      color: effectiveString(element, 'color', 'black'),
      bgcolor: effectiveString(element, 'bgcolor', 'white'),
    },
  }
}
