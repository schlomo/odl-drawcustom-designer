import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderPlot } from '../../../src/core/renderer/plot'
import { safeRenderElement } from '../../../src/core/renderer'
import { parseYamlPayload } from '../../../src/core/yaml'
import type { RenderContext } from '../../../src/core/renderer/types'

const context: RenderContext = { width: 400, height: 200, colorMode: 'bwr' }
const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/spec')

describe('renderPlot', () => {
  it('renders at least one series with axis lines for minimal plot', () => {
    const result = renderPlot(
      {
        type: 'plot',
        data: [{ entity: 'sensor.temperature', color: 'red', width: 2, smooth: true }],
      },
      context,
    )

    expect(result?.primitive).toMatchObject({
      kind: 'plot',
      series: expect.arrayContaining([
        expect.objectContaining({
          color: 'red',
          points: expect.any(Array),
        }),
      ]),
    })

    const primitive = result!.primitive
    if (primitive.kind !== 'plot') {
      throw new Error('expected plot primitive')
    }
    expect(primitive.series.length).toBeGreaterThan(0)
    expect(primitive.series[0]?.points.length).toBeGreaterThan(1)
    expect(primitive.axes.y).toBeDefined()
    expect(primitive.axes.x).toBeDefined()
  })

  it('honors explicit low and high for axis labels and series scaling', () => {
    const auto = renderPlot(
      { type: 'plot', data: [{ entity: 'sensor.temperature' }] },
      context,
    )
    const fixed = renderPlot(
      {
        type: 'plot',
        data: [{ entity: 'sensor.temperature' }],
        low: 10,
        high: 20,
        yaxis: { tick_every: 5 },
      },
      context,
    )

    const autoPrimitive = auto!.primitive
    const fixedPrimitive = fixed!.primitive
    if (autoPrimitive.kind !== 'plot' || fixedPrimitive.kind !== 'plot') {
      throw new Error('expected plot primitive')
    }

    const autoLabels = autoPrimitive.yLegendLabels.map((label) => label.text)
    const fixedLabels = fixedPrimitive.yLegendLabels.map((label) => label.text)
    expect(fixedLabels).toContain('10')
    expect(fixedLabels).toContain('15')
    expect(fixedLabels).toContain('20')
    expect(autoLabels).not.toEqual(fixedLabels)
  })

  it('passes legend font, sizes, and axis tick marks from spec options', () => {
    const result = renderPlot(
      {
        type: 'plot',
        data: [{ entity: 'sensor.temperature' }],
        low: 0,
        high: 10,
        font: 'ppb.ttf',
        size: 14,
        yaxis: { tick_width: 3, tick_every: 2 },
        xaxis: { tick_width: 4, tick_length: 6 },
        xlegend: { size: 16 },
      },
      context,
    )

    const primitive = result!.primitive
    if (primitive.kind !== 'plot') {
      throw new Error('expected plot primitive')
    }

    expect(primitive.legendFont).toBe('ppb.ttf')
    expect(primitive.yLegendLabels[0]?.fontSize).toBe(14)
    expect(primitive.xLegendLabels[0]?.fontSize).toBe(16)
    expect(primitive.yAxisTicks.length).toBeGreaterThan(0)
    expect(primitive.xAxisTicks.length).toBeGreaterThan(0)
    expect(primitive.yAxisTicks[0]?.lineWidth).toBe(3)
    expect(primitive.xAxisTicks[0]?.lineWidth).toBe(4)
    expect(primitive.xAxisTicks[0]?.y2 - primitive.xAxisTicks[0]?.y1).toBe(6)
  })

  it('renders rich spec fixture with nested axis and legend options', () => {
    const yaml = readFileSync(join(fixtureDir, 'plot-qrcode-rich.yaml'), 'utf8')
    const elements = parseYamlPayload(yaml)
    const plot = elements.find((element) => element.type === 'plot')
    expect(plot).toBeDefined()

    const result = renderPlot(plot as Extract<typeof plot, { type: 'plot' }>, {
      width: 300,
      height: 184,
      colorMode: 'bwr',
    })

    const primitive = result?.primitive
    expect(primitive).toMatchObject({ kind: 'plot' })
    if (!primitive || primitive.kind !== 'plot') {
      throw new Error('expected plot primitive')
    }
    expect(primitive.series.length).toBe(2)
    expect(primitive.gridLines.length).toBeGreaterThan(0)
    expect(primitive.yLegendLabels.length).toBeGreaterThan(0)
    expect(primitive.xLegendLabels.length).toBeGreaterThan(0)
    expect(primitive.yLegendLabels.map((label) => label.text)).toContain('10')
    expect(primitive.yLegendLabels.map((label) => label.text)).toContain('20')
    expect(primitive.legendFont).toBe('ppb.ttf')
    expect(primitive.yLegendLabels[0]?.fontSize).toBe(12)
    expect(primitive.xLegendLabels[0]?.fontSize).toBe(12)
    expect(primitive.yAxisTicks[0]?.lineWidth).toBe(2)
    expect(primitive.xAxisTicks[0]?.lineWidth).toBe(2)
    expect(primitive.series[0]?.showPoints).toBe(true)
    expect(primitive.series[0]?.lineWidth).toBe(2)
  })

  describe('templated data evaluated to a string (issue #56 follow-up)', () => {
    it('recovers a JSON array string (e.g. tojson filter output)', () => {
      const result = renderPlot(
        {
          type: 'plot',
          data: '[{"entity": "sensor.temperature", "color": "red"}]',
        },
        context,
      )

      const primitive = result?.primitive
      if (!primitive || primitive.kind !== 'plot') {
        throw new Error('expected plot primitive')
      }
      expect(primitive.series.length).toBe(1)
      expect(primitive.series[0]?.entity).toBe('sensor.temperature')
      expect(primitive.series[0]?.color).toBe('red')
    })

    it('throws instead of silently rendering the fixed placeholder series for an unresolved template', () => {
      expect(() =>
        renderPlot({ type: 'plot', data: '{{ my_series }}' }, context),
      ).toThrow(/data/i)
    })

    it('throws for a string that is not recoverable as data series', () => {
      // Nunjucks stringifies a native list of objects to "[object Object]" —
      // unrecoverable, unlike icon names or coordinate pairs.
      expect(() =>
        renderPlot({ type: 'plot', data: '[object Object]' }, context),
      ).toThrow(/data/i)
    })

    it('surfaces the failure as a render-error placeholder via safeRenderElement', () => {
      const result = safeRenderElement(
        { type: 'plot', data: '{{ my_series }}' },
        context,
      )

      expect(result?.primitive.kind).toBe('render-error')
      expect(result?.error).toMatch(/data/i)
    })
  })
})
