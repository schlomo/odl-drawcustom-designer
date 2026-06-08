import { describe, expect, it } from 'vitest'
import { createQrModuleGrid, qrRenderedSize } from '../../../src/core/renderer/qr-modules'
import { renderQrcode } from '../../../src/core/renderer/qrcode'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, accentMode: 'red' }

describe('createQrModuleGrid', () => {
  it('produces a stable module count for the same data string', () => {
    const first = createQrModuleGrid('https://www.example.com')
    const second = createQrModuleGrid('https://www.example.com')
    expect(first.modules).toBe(second.modules)
    expect(first.moduleData).toEqual(second.moduleData)
  })

  it('uses a deterministic placeholder for templated data', () => {
    const templated = createQrModuleGrid("{{ states('sensor.url') }}")
    const placeholder = createQrModuleGrid('[TEMPLATE]')
    expect(templated.modules).toBe(placeholder.modules)
    expect(templated.moduleData).toEqual(placeholder.moduleData)
  })
})

describe('renderQrcode', () => {
  it('emits a real qrcode primitive with module grid and honors boxsize and border', () => {
    const result = renderQrcode(
      {
        type: 'qrcode',
        data: 'https://www.example.com',
        x: 10,
        y: 20,
        boxsize: 3,
        border: 2,
        color: 'black',
        bgcolor: 'white',
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'qrcode',
      x: 10,
      y: 20,
      boxsize: 3,
      border: 2,
      modules: expect.any(Number),
      moduleData: expect.any(Array),
      color: '#000000',
      bgcolor: '#FFFFFF',
    })

    const primitive = result!.primitive
    if (primitive.kind !== 'qrcode') {
      throw new Error('expected qrcode primitive')
    }
    expect(primitive.moduleData).toHaveLength(primitive.modules * primitive.modules)
    expect(primitive.width).toBe(qrRenderedSize(primitive.modules, 3, 2))
    expect(primitive.height).toBe(qrRenderedSize(primitive.modules, 3, 2))
  })
})
