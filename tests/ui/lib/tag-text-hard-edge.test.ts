/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { loadBundledTestFont } from '../../core/renderer/font-test-utils'
import { drawCanvasStub, TAG_TEXT_HARD_EDGE_CANVAS_FILTER } from '../../../src/ui/lib/draw-canvas-stubs'

describe('tag text hard edge (Pillow fontmode parity)', () => {
  it('uses a discrete alpha threshold filter', () => {
    expect(TAG_TEXT_HARD_EDGE_CANVAS_FILTER).toContain('feFuncA')
    expect(TAG_TEXT_HARD_EDGE_CANVAS_FILTER).toContain('discrete')
    expect(TAG_TEXT_HARD_EDGE_CANVAS_FILTER).toContain('tableValues%3D%220%201%22')
  })

  it('applies the hard-edge filter when drawing opentype text', () => {
    const font = loadBundledTestFont('ppb.ttf')
    let assignedFilter: string | undefined
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      set filter(value: string) {
        assignedFilter = value
      },
      get filter() {
        return assignedFilter ?? 'none'
      },
      fillStyle: '#000000',
      font: '',
    } as unknown as CanvasRenderingContext2D

    drawCanvasStub(
      ctx,
      {
        kind: 'text-stub',
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        anchorX: 0,
        anchorY: 0,
        anchor: 'lt',
        value: 'Hi',
        drawLines: [{ text: 'Hi', visualText: 'Hi', x: 0, y: 16, width: 20, direction: 'ltr' }],
        color: 'black',
        defaultColor: 'black',
        parseColors: false,
        fontSize: 16,
        font: 'ppb.ttf',
      },
      new Map(),
      new Map(),
      new Map([['ppb.ttf', font]]),
    )

    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(assignedFilter).toBe(TAG_TEXT_HARD_EDGE_CANVAS_FILTER)
  })
})
