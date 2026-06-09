import { describe, expect, it } from 'vitest'
import {
  canvasEdgeSnapGuides,
  canvasPointSnapGuides,
  canvasSnapGuideLines,
  snapBoundsToCanvas,
  snapMoveDelta,
  snapPointToCanvas,
} from '../../../src/ui/lib/snap-to-grid'

const CANVAS = { width: 400, height: 300 }

describe('snapBoundsToCanvas', () => {
  it('snaps the left edge to 0 when within threshold', () => {
    expect(snapBoundsToCanvas({ x: 3, y: 40, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 0,
      y: 40,
      width: 50,
      height: 30,
    })
  })

  it('snaps the top edge to 0 when within threshold', () => {
    expect(snapBoundsToCanvas({ x: 40, y: 4, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 40,
      y: 0,
      width: 50,
      height: 30,
    })
  })

  it('pins the right edge to canvas width over grid snap', () => {
    expect(snapBoundsToCanvas({ x: 354, y: 40, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 350,
      y: 40,
      width: 50,
      height: 30,
    })
  })

  it('pins the bottom edge to canvas height over grid snap', () => {
    expect(snapBoundsToCanvas({ x: 40, y: 267, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 40,
      y: 270,
      width: 50,
      height: 30,
    })
  })

  it('snaps edges exactly at canvas bounds', () => {
    expect(
      snapBoundsToCanvas({ x: 0, y: 0, width: 400, height: 300 }, CANVAS.width, CANVAS.height, 10, true),
    ).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })

  it('grid-snaps when not near canvas edges', () => {
    expect(snapBoundsToCanvas({ x: 23, y: 17, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 20,
      y: 20,
      width: 50,
      height: 30,
    })
  })

  it('adjusts width and height when preserveSize is false', () => {
    expect(
      snapBoundsToCanvas(
        { x: 20, y: 30, width: 377, height: 267 },
        CANVAS.width,
        CANVAS.height,
        10,
        true,
        { preserveSize: false },
      ),
    ).toEqual({
      x: 20,
      y: 30,
      width: 380,
      height: 270,
    })
  })

  it('rounds without canvas snap when disabled', () => {
    expect(snapBoundsToCanvas({ x: 23.4, y: 17.6, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, false)).toEqual({
      x: 23,
      y: 18,
      width: 50,
      height: 30,
    })
  })
})

describe('snapMoveDelta with canvas edges', () => {
  it('reaches canvas origin when dragging near the top-left corner', () => {
    expect(
      snapMoveDelta({ x: 23, y: 17, width: 50, height: 30 }, -18, -12, 10, true, CANVAS),
    ).toEqual({ dx: -23, dy: -17 })
  })

  it('pins the selection to the bottom-right canvas corner', () => {
    expect(
      snapMoveDelta({ x: 345, y: 200, width: 52, height: 30 }, 3, 70, 10, true, CANVAS),
    ).toEqual({ dx: 3, dy: 70 })
  })
})

describe('canvas snap guides', () => {
  it('lists active canvas edges for bounds within threshold', () => {
    expect(
      canvasEdgeSnapGuides({ x: 2, y: 3, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true),
    ).toEqual(['left', 'top'])
    expect(
      canvasEdgeSnapGuides({ x: 352, y: 267, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, true),
    ).toEqual(['right', 'bottom'])
  })

  it('returns no guides when snap is disabled', () => {
    expect(canvasEdgeSnapGuides({ x: 0, y: 0, width: 50, height: 30 }, CANVAS.width, CANVAS.height, 10, false)).toEqual(
      [],
    )
  })

  it('maps edges to full-span guide lines', () => {
    expect(canvasSnapGuideLines(['left', 'bottom'], CANVAS.width, CANVAS.height)).toEqual([
      { edge: 'left', x1: 0, y1: 0, x2: 0, y2: 300 },
      { edge: 'bottom', x1: 0, y1: 300, x2: 400, y2: 300 },
    ])
  })

  it('lists active canvas edges for snapped points', () => {
    expect(canvasPointSnapGuides(398, 297, CANVAS.width, CANVAS.height, 10, true)).toEqual(['right', 'bottom'])
  })
})

describe('snapPointToCanvas', () => {
  it('pins pointer coords to canvas edges with right/bottom priority', () => {
    expect(snapPointToCanvas(398, 297, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 400,
      y: 300,
    })
  })

  it('snaps to grid and top-left when not near canvas edges', () => {
    expect(snapPointToCanvas(23, 17, CANVAS.width, CANVAS.height, 10, true)).toEqual({
      x: 20,
      y: 20,
    })
  })
})
