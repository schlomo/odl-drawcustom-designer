import { describe, expect, it } from 'vitest'
import {
  CANVAS_VIEWPORT_PADDING_PX,
  clientPointToCanvasCoords,
  computeAvailableStageArea,
  computeCanvasStageSize,
  computeCanvasViewportLayout,
  computeEffectiveCanvasScale,
  computeFitScale,
  formatCanvasPointerCoords,
  paperTransform,
  refineCanvasPointerPoint,
} from '../../../src/ui/lib/canvas-zoom'

/**
 * The canvas config's width/height are the logical drawing surface, already
 * oriented, and the designer always presents it upright (issue #139) — so none
 * of this math takes a rotation any more. A portrait canvas is simply a canvas
 * that is taller than it is wide.
 */

describe('computeFitScale', () => {
  it('shrinks uniformly to fit a small scrollport', () => {
    const scale = computeFitScale(400, 300, 800, 480, CANVAS_VIEWPORT_PADDING_PX)
    expect(scale).toBeLessThan(1)
    const stage = computeCanvasStageSize(800, 480, scale)
    const available = computeAvailableStageArea({ width: 400, height: 300 })
    expect(stage.width).toBeLessThanOrEqual(available.width + 0.5)
    expect(stage.height).toBeLessThanOrEqual(available.height + 0.5)
  })

  it('upscales when the canvas is smaller than the scrollport', () => {
    const scale = computeFitScale(2000, 1200, 800, 480, CANVAS_VIEWPORT_PADDING_PX)
    expect(scale).toBeGreaterThan(1)
    const stage = computeCanvasStageSize(800, 480, scale)
    const available = computeAvailableStageArea({ width: 2000, height: 1200 })
    expect(stage.width).toBeLessThanOrEqual(available.width + 0.5)
    expect(stage.height).toBeLessThanOrEqual(available.height + 0.5)
    expect(stage.height).toBeCloseTo(available.height, 0)
  })

  it('fits a portrait canvas to a portrait scrollport more generously than a landscape one', () => {
    const portrait = computeFitScale(500, 900, 480, 800, CANVAS_VIEWPORT_PADDING_PX)
    const landscape = computeFitScale(500, 900, 800, 480, CANVAS_VIEWPORT_PADDING_PX)
    expect(portrait).toBeGreaterThan(landscape)
  })
})

describe('computeEffectiveCanvasScale', () => {
  it('Fit mode follows fit scale', () => {
    expect(computeEffectiveCanvasScale('fit', 0.6)).toBe(0.6)
  })

  it('uses absolute scale factors for fixed zoom modes', () => {
    expect(computeEffectiveCanvasScale('100', 0.4)).toBe(1)
    expect(computeEffectiveCanvasScale('200', 0.4)).toBe(2)
    expect(computeEffectiveCanvasScale('50', 0.4)).toBe(0.5)
  })
})

describe('computeCanvasStageSize', () => {
  it('matches the scaled canvas at 200% zoom, portrait or landscape', () => {
    expect(computeCanvasStageSize(800, 480, 2)).toEqual({ width: 1600, height: 960 })
    expect(computeCanvasStageSize(480, 800, 2)).toEqual({ width: 960, height: 1600 })
  })
})

describe('computeCanvasViewportLayout', () => {
  const viewport = { width: 900, height: 500 }

  it('centers the stage when it fits inside the scrollport', () => {
    const stage = { width: 400, height: 240 }
    const layout = computeCanvasViewportLayout(viewport, stage)
    expect(layout.centerX).toBe(true)
    expect(layout.centerY).toBe(true)
    expect(layout.needsScrollX).toBe(false)
    expect(layout.needsScrollY).toBe(false)
    expect(layout.scrollContentWidth).toBe(viewport.width)
    expect(layout.scrollContentHeight).toBe(viewport.height)
  })

  it('anchors top-left and enables vertical scroll when the stage is taller', () => {
    const stage = { width: 400, height: 900 }
    const layout = computeCanvasViewportLayout(viewport, stage)
    expect(layout.centerY).toBe(false)
    expect(layout.needsScrollY).toBe(true)
    expect(layout.scrollContentHeight).toBe(stage.height + CANVAS_VIEWPORT_PADDING_PX)
    expect(layout.scrollContentHeight).toBeGreaterThan(viewport.height)
  })

  it('anchors top-left and enables horizontal scroll at 200% zoom', () => {
    const stage = computeCanvasStageSize(800, 480, 2)
    const panel = { width: 600, height: 500 }
    const layout = computeCanvasViewportLayout(panel, stage)
    expect(layout.needsScrollX).toBe(true)
    expect(layout.needsScrollY).toBe(true)
    expect(layout.centerX).toBe(false)
    expect(layout.centerY).toBe(false)
  })

  it('Fit stage fits within a YAML-shortened viewport height', () => {
    const shortViewport = { width: 900, height: 280 }
    const fitScale = computeFitScale(
      shortViewport.width,
      shortViewport.height,
      800,
      480,
      CANVAS_VIEWPORT_PADDING_PX,
    )
    const stage = computeCanvasStageSize(800, 480, fitScale)
    const layout = computeCanvasViewportLayout(shortViewport, stage)
    expect(layout.centerY).toBe(true)
    expect(layout.needsScrollY).toBe(false)
    const available = computeAvailableStageArea(shortViewport)
    expect(stage.height).toBeLessThanOrEqual(available.height)
  })
})

describe('canvas hit-test coordinates', () => {
  it('maps client coordinates through the stage rect at 200%', () => {
    const stageRect = {
      left: 0,
      top: 0,
      width: 1600,
      height: 960,
    } as DOMRect

    expect(clientPointToCanvasCoords(800, 480, stageRect, 800, 480)).toEqual({ x: 400, y: 240 })
  })

  it('maps the bottom-right corner at 200% zoom', () => {
    const stageRect = {
      left: 40,
      top: 20,
      width: 1600,
      height: 960,
    } as DOMRect

    expect(
      clientPointToCanvasCoords(40 + 1600, 20 + 960, stageRect, 800, 480),
    ).toEqual({ x: 800, y: 480 })
  })

  it('maps a portrait canvas the same way — no turn in the pointer path', () => {
    const paperRect = { left: 0, top: 0, width: 480, height: 800 } as DOMRect

    expect(clientPointToCanvasCoords(120, 200, paperRect, 480, 800)).toEqual({ x: 120, y: 200 })
    expect(clientPointToCanvasCoords(480, 800, paperRect, 480, 800)).toEqual({ x: 480, y: 800 })
  })
})

describe('canvas pointer refinement', () => {
  it('snaps near-edge floats to exact border pixels', () => {
    expect(refineCanvasPointerPoint({ x: 799.8, y: 479.9 }, 800, 480)).toEqual({ x: 800, y: 480 })
    expect(refineCanvasPointerPoint({ x: 0.2, y: 0.1 }, 800, 480)).toEqual({ x: 0, y: 0 })
  })

  it('rejects points clearly outside the canvas', () => {
    expect(refineCanvasPointerPoint({ x: 801, y: 240 }, 800, 480)).toBeNull()
  })

  it('formats stable integer coordinates for the overlay', () => {
    expect(formatCanvasPointerCoords({ x: 799.7, y: 240.2 }, 800, 480)).toBe('800, 240')
    expect(formatCanvasPointerCoords({ x: 800.3, y: 480.4 }, 800, 480)).toBe('800, 480')
  })
})

describe('canvas paper transform', () => {
  it('scales the paper from its top-left corner and never turns it', () => {
    const canvasWidth = 480
    const canvasHeight = 800

    for (const scale of [0.5, 1, 2]) {
      const transform = paperTransform(scale)
      expect(transform).toBe(`scale(${scale})`)

      // Round-trip: a canvas point lands where the pointer path reads it back.
      const paperRect = {
        left: 0,
        top: 0,
        width: canvasWidth * scale,
        height: canvasHeight * scale,
      } as DOMRect
      for (const [cx, cy] of [
        [0, 0],
        [canvasWidth, 0],
        [0, canvasHeight],
        [canvasWidth, canvasHeight],
      ] as const) {
        const roundTrip = clientPointToCanvasCoords(
          cx * scale,
          cy * scale,
          paperRect,
          canvasWidth,
          canvasHeight,
        )
        expect(roundTrip.x).toBeCloseTo(cx, 5)
        expect(roundTrip.y).toBeCloseTo(cy, 5)
      }
    }
  })
})

describe('regression: fit preserves full canvas height for debug grid Y labels', () => {
  it('stage height matches scaled native height on a short panel', () => {
    const fitScale = computeEffectiveCanvasScale(
      'fit',
      computeFitScale(900, 280, 800, 480, CANVAS_VIEWPORT_PADDING_PX),
    )
    const stage = computeCanvasStageSize(800, 480, fitScale)
    expect(stage.height).toBeCloseTo(480 * fitScale, 5)
    expect(stage.width).toBeCloseTo(800 * fitScale, 5)
  })
})
