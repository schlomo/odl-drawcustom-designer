/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import {
  paintOptionsFromContext,
  resolvePreviewCanvasPaint,
  resolvePreviewPaint,
} from '../../../src/core/renderer/preview-paint'
import { renderPlot } from '../../../src/core/renderer/plot'

function mockCanvasContext(): CanvasRenderingContext2D {
  const tileCtx = {
    fillStyle: '',
    fillRect: vi.fn(),
  }
  vi.spyOn(document, 'createElement').mockReturnValue({
    width: 4,
    height: 4,
    getContext: () => tileCtx,
  } as unknown as HTMLCanvasElement)

  const ctx = {
    createPattern: vi.fn(() => ({ kind: 'pattern' })),
  } as unknown as CanvasRenderingContext2D

  return ctx
}

describe('resolvePreviewPaint', () => {
  it('uses an SVG pattern url when ordered dither is enabled', () => {
    expect(resolvePreviewPaint('half_black', { colorMode: 'bwr', ditherMode: 2 })).toBe(
      'url(#ht-half_black-bwr)',
    )
  })

  it('returns flat gray without dither', () => {
    expect(resolvePreviewPaint('half_black', { colorMode: 'bwr', ditherMode: 0 })).toBe('#808080')
  })
})

describe('resolvePreviewCanvasPaint', () => {
  it('returns a repeating pattern for halftone colors when d=2', () => {
    const ctx = mockCanvasContext()
    const paint = resolvePreviewCanvasPaint(ctx, 'half_accent', {
      colorMode: 'bwr',
      ditherMode: 2,
    })
    expect(paint).toEqual({ kind: 'pattern' })
    expect(ctx.createPattern).toHaveBeenCalled()
  })

  it('returns flat hex without dither', () => {
    const ctx = mockCanvasContext()
    expect(
      resolvePreviewCanvasPaint(ctx, 'half_accent', { colorMode: 'bwr', ditherMode: 0 }),
    ).toBe('#FF8080')
  })
})

describe('plot stores color names for draw-time preview paint', () => {
  it('keeps YAML color names on series instead of baking hex', () => {
    const result = renderPlot(
      {
        type: 'plot',
        data: [{ entity: 'sensor.temperature', color: 'half_accent', point_color: 'half_black' }],
      },
      { width: 120, height: 80, colorMode: 'bwr', ditherMode: 2 },
    )

    const primitive = result?.primitive
    expect(primitive?.kind).toBe('plot')
    if (!primitive || primitive.kind !== 'plot') {
      return
    }

    expect(primitive.series[0]).toMatchObject({
      color: 'half_accent',
      pointColor: 'half_black',
    })
  })

  it('simulates BWR tag output for explicit yellow on canvas via palette clamp', () => {
    const result = renderPlot(
      {
        type: 'plot',
        data: [{ entity: 'sensor.temperature', color: 'yellow', width: 2 }],
      },
      { width: 120, height: 80, colorMode: 'bwr' },
    )

    const primitive = result?.primitive
    expect(primitive?.kind).toBe('plot')
    if (!primitive || primitive.kind !== 'plot') {
      return
    }

    expect(primitive.series[0]?.color).toBe('yellow')

    const ctx = mockCanvasContext()
    expect(
      resolvePreviewCanvasPaint(ctx, primitive.series[0]!.color, { colorMode: 'bwr' }),
    ).toBe('#808080')
  })

  it('does not remap yellow to a halftone pattern — only halftone names use patterns', () => {
    expect(resolvePreviewPaint('yellow', { colorMode: 'bwr', ditherMode: 2 })).toBe('#808080')
  })

  it('builds paint options from render context', () => {
    expect(
      paintOptionsFromContext({ width: 100, height: 100, colorMode: 'bw', ditherMode: 2 }),
    ).toEqual({ colorMode: 'bw', ditherMode: 2 })
  })
})
