import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixture for the standalone drag-scroll regression: selecting/dragging an
 * element whose YAML block sits near the end of a long document while its
 * property form is long enough to overflow the properties panel.
 *
 * `PADDING_COUNT` tiny corner rectangles make the YAML document long, so the
 * Linked editor scroll cannot center the progress_bar block inside the
 * editor's own scroller. The progress_bar is the last element and carries a
 * `font` field, so its property form ends (hidden font-upload input included)
 * well below the viewport bottom. Element index 0 is a plain rectangle: the
 * share-hash loader leaves it selected, giving every test a short-form,
 * no-slack baseline.
 */
export const DRAG_SCROLL_CANVAS = { width: 400, height: 400 } as const

export const DRAG_PADDING_COUNT = 40

export const DRAG_TARGET_BAR = {
  typeLabel: 'progress bar',
  x_start: 40,
  x_end: 360,
  y_start: 300,
  y_end: 340,
  centerX: 200,
  centerY: 320,
} as const

export function buildDragScrollPayload(): SharePayload {
  const padding = Array.from({ length: DRAG_PADDING_COUNT }, () => ({
    type: 'rectangle' as const,
    x_start: 0,
    x_end: 4,
    y_start: 0,
    y_end: 4,
    fill: 'black' as const,
  }))

  return {
    v: 1,
    name: 'Playwright drag-scroll fixture',
    canvas: {
      width: DRAG_SCROLL_CANVAS.width,
      height: DRAG_SCROLL_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      ...padding,
      {
        type: 'progress_bar',
        x_start: DRAG_TARGET_BAR.x_start,
        y_start: DRAG_TARGET_BAR.y_start,
        x_end: DRAG_TARGET_BAR.x_end,
        y_end: DRAG_TARGET_BAR.y_end,
        progress: 45,
        fill: 'red',
        outline: 'black',
        show_percentage: true,
        font: 'ppb.ttf',
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildDragScrollPayload}. */
export function dragScrollSharePath(): string {
  return `/#d=${encodeShareHash(buildDragScrollPayload())}`
}
