import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixture for the multiline drag/offset_y regression: `offset_y` is line
 * spacing (docs/spec/supported_types.md), so dragging the block must change
 * `y` and leave `offset_y` alone.
 *
 * A single multiline element, deliberately alone on the canvas so the
 * pointerdown hit-test cannot pick anything else, and template-free so the
 * preview clock never arms (it would keep re-serializing the document).
 */
export const MULTILINE_DRAG_CANVAS = { width: 400, height: 300 } as const

export const MULTILINE_DRAG_ELEMENT = {
  x: 40,
  y: 60,
  offset_y: 40,
  size: 24,
  /** A point comfortably inside the rendered three-line block. */
  grabX: 80,
  grabY: 96,
} as const

export function buildMultilineDragPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright multiline drag fixture',
    canvas: {
      width: MULTILINE_DRAG_CANVAS.width,
      height: MULTILINE_DRAG_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'multiline',
        value: 'ALPHA|BETA|GAMMA',
        delimiter: '|',
        x: MULTILINE_DRAG_ELEMENT.x,
        y: MULTILINE_DRAG_ELEMENT.y,
        offset_y: MULTILINE_DRAG_ELEMENT.offset_y,
        size: MULTILINE_DRAG_ELEMENT.size,
        font: 'ppb.ttf',
        color: 'black',
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildMultilineDragPayload}. */
export function multilineDragSharePath(): string {
  return `/#d=${encodeShareHash(buildMultilineDragPayload())}`
}
