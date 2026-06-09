import { describe, expect, it } from 'vitest'
import { renderCircle } from '../../../src/core/renderer/circle'
import { renderProgressBar } from '../../../src/core/renderer/progress-bar'
import { renderEllipse } from '../../../src/core/renderer/ellipse'
import { renderDebugGrid } from '../../../src/core/renderer/debug-grid'
import { resolveSvgPaint } from '../../../src/core/renderer/svg-paint'

describe('renderCircle color mode integration', () => {
  it('maps red fill to black in BW preview', () => {
    const result = renderCircle(
      { type: 'circle', x: 10, y: 10, radius: 5, fill: 'red' },
      { width: 100, height: 100, colorMode: 'bw' },
    )

    expect(result?.layer).toBe('svg')
    if (result?.layer === 'svg' && result.primitive.kind === 'circle') {
      expect(result.primitive.fill).toBe('#000000')
    }
  })

  it('maps hex fill to monochrome in BW preview', () => {
    const result = renderCircle(
      { type: 'circle', x: 10, y: 10, radius: 5, fill: '#FF0000' },
      { width: 100, height: 100, colorMode: 'bw' },
    )

    expect(result?.layer).toBe('svg')
    if (result?.layer === 'svg' && result.primitive.kind === 'circle') {
      expect(result.primitive.fill).toBe('#000000')
    }
  })
})

describe('incompatible accent primary remapping', () => {
  it('clamps explicit red fills to nearest BWY palette for circle and progress bar', () => {
    const bwy = { width: 800, height: 480, colorMode: 'bwy' as const }
    const expected = '#808080'

    const circle = renderCircle({ type: 'circle', x: 10, y: 10, radius: 5, fill: 'red' }, bwy)
    const bar = renderProgressBar(
      {
        type: 'progress_bar',
        x_start: 0,
        x_end: 100,
        y_start: 0,
        y_end: 20,
        progress: 50,
        fill: 'red',
      },
      bwy,
    )

    if (circle?.layer === 'svg' && circle.primitive.kind === 'circle') {
      expect(circle.primitive.fill).toBe(expected)
    }
    if (bar?.layer === 'svg' && bar.primitive.kind === 'progress-bar-stub') {
      expect(bar.primitive.fill.fill).toBe(expected)
    }
  })

  it('clamps explicit yellow fills to nearest BWR palette for circle and progress bar', () => {
    const bwr = { width: 800, height: 480, colorMode: 'bwr' as const }
    const expected = '#808080'

    const circle = renderCircle({ type: 'circle', x: 10, y: 10, radius: 5, fill: 'yellow' }, bwr)
    const bar = renderProgressBar(
      {
        type: 'progress_bar',
        x_start: 0,
        x_end: 100,
        y_start: 0,
        y_end: 20,
        progress: 50,
        fill: 'yellow',
      },
      bwr,
    )

    if (circle?.layer === 'svg' && circle.primitive.kind === 'circle') {
      expect(circle.primitive.fill).toBe(expected)
    }
    if (bar?.layer === 'svg' && bar.primitive.kind === 'progress-bar-stub') {
      expect(bar.primitive.fill.fill).toBe(expected)
    }
  })
})

describe('resolveSvgPaint halftone patterns', () => {
  it('uses an SVG pattern url when ordered dither is enabled', () => {
    expect(
      resolveSvgPaint('half_black', { colorMode: 'bwr', ditherMode: 2 }),
    ).toBe('url(#ht-half_black-bwr)')
  })

  it('returns flat gray without dither', () => {
    expect(resolveSvgPaint('half_black', { colorMode: 'bwr', ditherMode: 0 })).toBe('#808080')
  })

  it('uses halftone patterns for ellipse fills when d=2', () => {
    const result = renderEllipse(
      {
        type: 'ellipse',
        x_start: 0,
        x_end: 40,
        y_start: 0,
        y_end: 20,
        fill: 'half_accent',
      },
      { width: 100, height: 100, colorMode: 'bwr', ditherMode: 2 },
    )

    expect(result?.layer).toBe('svg')
    if (result?.layer === 'svg' && result.primitive.kind === 'ellipse') {
      expect(result.primitive.fill).toBe('url(#ht-half_accent-bwr)')
    }
  })

  it('uses halftone stroke patterns for debug grid lines when d=2', () => {
    const result = renderDebugGrid(
      { type: 'debug_grid', spacing: 20, line_color: 'half_accent' },
      { width: 100, height: 100, colorMode: 'bwr', ditherMode: 2 },
    )

    expect(result?.layer).toBe('svg')
    if (result?.layer === 'svg' && result.primitive.kind === 'debug-grid-stub') {
      expect(result.primitive.stroke).toBe('url(#ht-half_accent-bwr)')
    }
  })
})
