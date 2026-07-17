import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Fixture for issue #36 (selection-priority hit-testing): a small draggable
 * circle at index 0, fully covered by a later, full-canvas rectangle at
 * index 1 (standing in for the showcase demo's `debug_grid`, without
 * special-casing it — the maintainer ruling for #36 is a general mechanism,
 * not a `debug_grid` fix). Elements paint in array order (ADR-007 parity
 * with HA `imagegen`), so plain topmost-wins hit-testing always resolves
 * clicks anywhere on the canvas to the index-1 occluder — the buried circle
 * is otherwise unreachable on canvas. Distinct element types (circle vs.
 * rectangle) so the element list can unambiguously target the buried one.
 */
export const PRIORITY_CANVAS = { width: 300, height: 200 } as const

export const BURIED_CIRCLE = {
  index: 0,
  typeLabel: 'circle',
  x: 50,
  y: 50,
  radius: 20,
} as const

export const OCCLUDER_RECT = {
  index: 1,
  typeLabel: 'rectangle',
  x_start: 0,
  x_end: PRIORITY_CANVAS.width,
  y_start: 0,
  y_end: PRIORITY_CANVAS.height,
} as const

export function buildSelectionPriorityPayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright selection-priority fixture (#36)',
    canvas: {
      width: PRIORITY_CANVAS.width,
      height: PRIORITY_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'circle',
        x: BURIED_CIRCLE.x,
        y: BURIED_CIRCLE.y,
        radius: BURIED_CIRCLE.radius,
        fill: 'red',
        outline: 'black',
        width: 2,
      },
      {
        type: 'rectangle',
        x_start: OCCLUDER_RECT.x_start,
        x_end: OCCLUDER_RECT.x_end,
        y_start: OCCLUDER_RECT.y_start,
        y_end: OCCLUDER_RECT.y_end,
        fill: 'black',
        outline: 'black',
        width: 0,
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildSelectionPriorityPayload}. */
export function selectionPrioritySharePath(): string {
  return `/#d=${encodeShareHash(buildSelectionPriorityPayload())}`
}
