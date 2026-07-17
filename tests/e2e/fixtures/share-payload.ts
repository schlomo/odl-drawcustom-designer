import { encodeShareHash } from '../../../src/share'
import type { SharePayload } from '../../../src/share'

/**
 * Deterministic canvas used by the smoke suite: three well-separated,
 * non-templated elements so click coordinates and layout are stable across
 * runs (unlike the built-in showcase demo, which packs ~20 elements on one
 * canvas). Loaded via the `#d=` share-hash mechanism (ADR-005, src/share/),
 * which is the same code path a real "Copy share link" round-trip exercises.
 */
export const SMOKE_CANVAS = { width: 400, height: 300 } as const

export const SMOKE_RECT = {
  index: 0,
  typeLabel: 'rectangle',
  x_start: 20,
  x_end: 140,
  y_start: 20,
  y_end: 140,
  centerX: 80,
  centerY: 80,
} as const

export const SMOKE_CIRCLE = {
  index: 1,
  typeLabel: 'circle',
  x: 260,
  y: 80,
  radius: 50,
} as const

export const SMOKE_TEXT = {
  index: 2,
  typeLabel: 'text',
  value: 'Hello E2E',
  x: 20,
  y: 220,
} as const

export function buildSmokePayload(): SharePayload {
  return {
    v: 1,
    name: 'Playwright smoke fixture',
    canvas: {
      width: SMOKE_CANVAS.width,
      height: SMOKE_CANVAS.height,
      rotation: 0,
      accent: 'red',
    },
    elements: [
      {
        type: 'rectangle',
        x_start: SMOKE_RECT.x_start,
        x_end: SMOKE_RECT.x_end,
        y_start: SMOKE_RECT.y_start,
        y_end: SMOKE_RECT.y_end,
        fill: 'black',
        outline: 'black',
        width: 2,
      },
      {
        type: 'circle',
        x: SMOKE_CIRCLE.x,
        y: SMOKE_CIRCLE.y,
        radius: SMOKE_CIRCLE.radius,
        fill: 'red',
        outline: 'black',
        width: 2,
      },
      {
        type: 'text',
        value: SMOKE_TEXT.value,
        x: SMOKE_TEXT.x,
        y: SMOKE_TEXT.y,
        size: 24,
        color: 'black',
        font: 'ppb.ttf',
      },
    ],
  }
}

/** Path (with `#d=` fragment) that seeds the app with {@link buildSmokePayload}. */
export function smokeSharePath(): string {
  return `/#d=${encodeShareHash(buildSmokePayload())}`
}
