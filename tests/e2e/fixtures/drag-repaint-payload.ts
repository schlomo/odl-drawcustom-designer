import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixture for the drag-repaint regression (issue: perf(canvas) drag latency).
 *
 * A plain rectangle (SVG layer, the drag target) plus three canvas-layer
 * elements — text, qrcode and multiline all render through
 * `CanvasElementLayer`, whose draw effect starts with `clearRect`. Dragging
 * the rectangle changes ONLY the rectangle, so no other element's canvas
 * layer has any reason to repaint.
 *
 * Deliberately template-free: a `{{ now() }}` field would arm the preview
 * clock, whose tick legitimately repaints every layer once a second and would
 * make the repaint count non-deterministic.
 */
export const DRAG_REPAINT_CANVAS = { width: 400, height: 300 } as const

export const DRAG_REPAINT_TARGET = {
  x_start: 40,
  x_end: 160,
  y_start: 40,
  y_end: 120,
  centerX: 100,
  centerY: 80,
} as const

export function buildDragRepaintPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright drag-repaint fixture',
    canvas: {
      width: DRAG_REPAINT_CANVAS.width,
      height: DRAG_REPAINT_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'rectangle',
        x_start: DRAG_REPAINT_TARGET.x_start,
        x_end: DRAG_REPAINT_TARGET.x_end,
        y_start: DRAG_REPAINT_TARGET.y_start,
        y_end: DRAG_REPAINT_TARGET.y_end,
        fill: 'white',
        outline: 'black',
        width: 2,
      },
      {
        type: 'text',
        value: 'canvas layer one',
        x: 20,
        y: 200,
        size: 18,
        font: 'ppb.ttf',
        color: 'black',
      },
      {
        type: 'multiline',
        value: 'canvas/layer/two',
        delimiter: '/',
        x: 20,
        y: 230,
        offset_y: 18,
        size: 14,
        font: 'ppb.ttf',
        color: 'black',
      },
      {
        type: 'qrcode',
        data: 'https://example.invalid/drag-repaint',
        x: 260,
        y: 180,
        boxsize: 2,
        border: 1,
        color: 'black',
        bgcolor: 'white',
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildDragRepaintPayload}. */
export function dragRepaintSharePath(): string {
  return `/#d=${encodeShareHash(buildDragRepaintPayload())}`
}
