import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixtures for the pinch-from-`fit` regression (review finding B1, PR #153):
 * `nextZoomModeForPinch` hardcoded `fit → '100'` on increase / `fit → '50'`
 * on decrease, never consulting `fitScale` — wrong whenever `fit`'s own
 * (viewport-dependent) scale sits on the far side of that hardcoded target
 * from the pinch's direction.
 *
 * Both canvases below are sized against this suite's actual default
 * Playwright viewport (measured: canvas-viewport client box ~736x252 at
 * `CANVAS_VIEWPORT_PADDING_PX` = 48) so their `fitScale` is a known,
 * reproducible value without forcing `zoomMode` — these tests are
 * specifically about the untouched *default* ('fit') zoom.
 */

/** A real e-paper display size — fitScale ≈159% in this suite's viewport (well above the '200' level, and on the wrong side of the old hardcoded 'fit → 100'). */
export const PINCH_FIT_SMALL_CANVAS = { width: 296, height: 128 } as const

export const PINCH_FIT_SMALL_RECT = {
  typeLabel: 'rectangle',
  x_start: 20,
  y_start: 20,
  x_end: 100,
  y_end: 80,
  centerX: 60,
  centerY: 50,
} as const

export function buildPinchFitSmallPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright pinch-from-fit small-canvas fixture',
    canvas: {
      width: PINCH_FIT_SMALL_CANVAS.width,
      height: PINCH_FIT_SMALL_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'rectangle',
        x_start: PINCH_FIT_SMALL_RECT.x_start,
        y_start: PINCH_FIT_SMALL_RECT.y_start,
        x_end: PINCH_FIT_SMALL_RECT.x_end,
        y_end: PINCH_FIT_SMALL_RECT.y_end,
        fill: 'black',
        outline: 'black',
        width: 2,
      },
    ],
  }
}

export function pinchFitSmallSharePath(): string {
  return `/#d=${encodeShareHash(buildPinchFitSmallPayload())}`
}
