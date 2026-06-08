import QRCode from 'qrcode'
import { hasTemplateSyntax } from '../templates/patterns'

export interface QrModuleGrid {
  modules: number
  moduleData: boolean[]
}

const TEMPLATE_PLACEHOLDER = '[TEMPLATE]'

export function qrEncodeData(data: string): string {
  return hasTemplateSyntax(data) ? TEMPLATE_PLACEHOLDER : data
}

export function createQrModuleGrid(data: string): QrModuleGrid {
  const qr = QRCode.create(qrEncodeData(data), { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const moduleData: boolean[] = []

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      moduleData.push(qr.modules.get(row, col) === 1)
    }
  }

  return { modules: size, moduleData }
}

export function qrRenderedSize(modules: number, boxsize: number, border: number): number {
  return (modules + border * 2) * boxsize
}
