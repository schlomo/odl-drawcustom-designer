import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixture for the touch-drag regression (issue #149): a deliberately
 * oversized canvas (1000x1000) so that, once the zoom preference forces a
 * fixed pixel scale (never "fit", which always shrinks/grows the canvas to
 * avoid scroll — see `computeCanvasViewportLayout`), the canvas viewport
 * (`[data-testid="canvas-viewport"]`, `overflow-auto`) is genuinely
 * scrollable regardless of the test runner's window size. That scrollable
 * ancestor is exactly the precondition for the browser to "claim" a
 * single-finger touch gesture as a pan/scroll instead of delivering it to
 * the pointer-event drag session (the bug in #149).
 *
 * The single rectangle sits in the top-left corner so it — and its resize
 * handle — stay on-screen at the viewport's initial (0,0) scroll position no
 * matter how large or small the surrounding chrome (sidebar/property panel)
 * ends up being.
 */
export const TOUCH_DRAG_CANVAS = { width: 1000, height: 1000 } as const

export const TOUCH_DRAG_RECT = {
  typeLabel: 'rectangle',
  x_start: 20,
  y_start: 20,
  x_end: 140,
  y_end: 140,
  centerX: 80,
  centerY: 80,
} as const

export function buildTouchDragPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright touch-drag fixture',
    canvas: {
      width: TOUCH_DRAG_CANVAS.width,
      height: TOUCH_DRAG_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'rectangle',
        x_start: TOUCH_DRAG_RECT.x_start,
        y_start: TOUCH_DRAG_RECT.y_start,
        x_end: TOUCH_DRAG_RECT.x_end,
        y_end: TOUCH_DRAG_RECT.y_end,
        fill: 'black',
        outline: 'black',
        width: 2,
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildTouchDragPayload}. */
export function touchDragSharePath(): string {
  return `/#d=${encodeShareHash(buildTouchDragPayload())}`
}

/**
 * Two-rectangle variant for the multi-touch corruption regression (#149
 * follow-up, maintainer tablet report): a second finger landing while a
 * drag is in progress must never hit-test, select, or move whatever is
 * under it. Rect A is the one the primary finger drags; Rect B sits far
 * enough away (x 300-420) that the two never overlap, and both stay in the
 * visible top-left region at the fixture's forced 100% zoom.
 */
export const TOUCH_DRAG_RECT_A = TOUCH_DRAG_RECT

export const TOUCH_DRAG_RECT_B = {
  typeLabel: 'rectangle',
  x_start: 300,
  y_start: 20,
  x_end: 420,
  y_end: 140,
  centerX: 360,
  centerY: 80,
} as const

export function buildTouchMultiTouchPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright touch multi-touch fixture',
    canvas: {
      width: TOUCH_DRAG_CANVAS.width,
      height: TOUCH_DRAG_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'rectangle',
        x_start: TOUCH_DRAG_RECT_A.x_start,
        y_start: TOUCH_DRAG_RECT_A.y_start,
        x_end: TOUCH_DRAG_RECT_A.x_end,
        y_end: TOUCH_DRAG_RECT_A.y_end,
        fill: 'black',
        outline: 'black',
        width: 2,
      },
      {
        type: 'rectangle',
        x_start: TOUCH_DRAG_RECT_B.x_start,
        y_start: TOUCH_DRAG_RECT_B.y_start,
        x_end: TOUCH_DRAG_RECT_B.x_end,
        y_end: TOUCH_DRAG_RECT_B.y_end,
        fill: 'red',
        outline: 'black',
        width: 2,
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildTouchMultiTouchPayload}. */
export function touchMultiTouchSharePath(): string {
  return `/#d=${encodeShareHash(buildTouchMultiTouchPayload())}`
}
