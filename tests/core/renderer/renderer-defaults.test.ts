import { describe, expect, it } from 'vitest'
import { getPropertyEffectiveValue } from '../../../src/core/schema/propertyMetadata'
import { renderDebugGrid } from '../../../src/core/renderer/debug-grid'
import { renderProgressBar } from '../../../src/core/renderer/progress-bar'
import { renderQrcode } from '../../../src/core/renderer/qrcode'
import { renderText } from '../../../src/core/renderer/text'
import { measureTextWidth } from '../../../src/core/renderer/text-layout'
import type { RenderContext } from '../../../src/core/renderer/types'
import { loadBundledTestFont } from './font-test-utils'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }

describe('renderer uses propertyMetadata defaults', () => {
  it('renders text at spec default size 20 when size is omitted from yaml', () => {
    loadBundledTestFont('ppb.ttf')
    const font = loadBundledTestFont('ppb.ttf')
    const value = 'Hello'

    const atDefault = renderText({ type: 'text', value, x: 0, y: 0, font: 'ppb.ttf' }, context)
    const explicit = renderText(
      { type: 'text', value, x: 0, y: 0, size: 20, font: 'ppb.ttf' },
      context,
    )

    expect(getPropertyEffectiveValue({ type: 'text', value, x: 0 }, 'size')).toBe(20)
    expect(atDefault?.primitive).toMatchObject({ kind: 'text-stub', fontSize: 20 })
    expect(atDefault?.primitive).toEqual(explicit?.primitive)
    expect(measureTextWidth(font, value, 20)).toBeGreaterThan(measureTextWidth(font, value, 12))
  })

  it('uses debug_grid spacing default 20 and dashed lines by default', () => {
    const result = renderDebugGrid({ type: 'debug_grid' }, context)
    expect(result?.primitive).toMatchObject({
      kind: 'debug-grid-stub',
      spacing: 20,
      dashed: true,
      dashLength: 2,
      spaceLength: 4,
      showLabels: true,
      labelStep: 40,
    })
  })

  it('uses progress_bar fill default red', () => {
    const result = renderProgressBar(
      { type: 'progress_bar', x_start: 0, x_end: 100, y_start: 0, y_end: 20, progress: 50 },
      context,
    )
    expect(result?.primitive.fill.fill).toBe('#FF0000')
  })

  it('uses qrcode boxsize and border defaults from spec metadata', () => {
    const result = renderQrcode({ type: 'qrcode', data: 'test', x: 0, y: 0 }, context)
    expect(result?.primitive).toMatchObject({
      kind: 'qrcode',
      modules: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    })
  })
})
