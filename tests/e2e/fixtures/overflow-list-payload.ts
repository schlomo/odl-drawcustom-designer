import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * A long element list (issue #44): overflows the sidebar's element-list
 * panel so the selected row can genuinely be off-screen. Loaded via the
 * `#d=` share-hash mechanism (ADR-005, src/share/), same as the smoke
 * fixture in share-payload.ts.
 *
 * `PADDING_COUNT` block-stacked, off-canvas-click-area rectangles occupy
 * list rows 1..PADDING_COUNT; `TARGET_CIRCLE` is element index 0 — drawn
 * first (back), so `layerPanelDisplayOrder`'s front-first reversal puts its
 * row at the very bottom of the panel, below the fold. The padding
 * rectangles are packed into a tiny corner far from the circle so a canvas
 * click on the circle can never hit-test a padding rectangle instead.
 */
export const OVERFLOW_CANVAS = { width: 400, height: 400 } as const

export const PADDING_COUNT = 44

export const TARGET_CIRCLE = {
  index: 0,
  typeLabel: 'circle',
  x: 300,
  y: 300,
  radius: 30,
} as const

export function buildOverflowListPayload(): SharePayload {
  const padding = Array.from({ length: PADDING_COUNT }, () => ({
    type: 'rectangle' as const,
    x_start: 0,
    x_end: 4,
    y_start: 0,
    y_end: 4,
    fill: 'black' as const,
  }))

  return {
    v: 1,
    name: 'Playwright overflow-list fixture',
    canvas: {
      width: OVERFLOW_CANVAS.width,
      height: OVERFLOW_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'circle',
        x: TARGET_CIRCLE.x,
        y: TARGET_CIRCLE.y,
        radius: TARGET_CIRCLE.radius,
        fill: 'blue',
        outline: 'black',
        width: 2,
      },
      ...padding,
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildOverflowListPayload}. */
export function overflowListSharePath(): string {
  return `/#d=${encodeShareHash(buildOverflowListPayload())}`
}
