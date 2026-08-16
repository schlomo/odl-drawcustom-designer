import { expect, test, type Page } from '@playwright/test'
import { canvasPaper } from './fixtures/canvas'
import {
  DRAG_REPAINT_CANVAS,
  DRAG_REPAINT_TARGET,
  dragRepaintSharePath,
} from './fixtures/drag-repaint-payload'

/**
 * Drag latency (maintainer report, 2026-08-16): dragging an element with the
 * full demo payload loaded was sluggish, while a single rectangle stayed
 * smooth. Measured on the production build (headed Chromium, real GPU):
 * ~43 ms per pointermove with the demo payload vs ~17 ms with one rectangle.
 *
 * Root cause: `DesignerCanvas` derives `fontAssetKeys` / `dlimgAssetKeys`
 * from `elements` with `useMemo`, so every element edit produced fresh array
 * identities; `displayAssetImages` (memoized on `dlimgAssetKeys`) then handed
 * every `CanvasElementSlot` a brand-new `assetImages` Map. That breaks the
 * slot memo for EVERY element, so `CanvasElementLayer`'s draw effect re-ran
 * for the whole stack — full opentype glyph draw plus the per-pixel palette
 * quantize pass — on every single pointermove, defeating the `frozenElements`
 * snapshot that exists precisely to keep the base layers still during a drag.
 *
 * Observable contract asserted here: dragging a rectangle (an SVG-layer
 * element) repaints no other element's canvas layer at all. `clearRect` is
 * the first call of `CanvasElementLayer`'s draw effect, so counting it counts
 * layer repaints. Real-browser only — jsdom has no canvas rendering context.
 */

const CLEAR_RECT_COUNTER = () => {
  const state = { count: 0 }
  ;(window as unknown as { __layerRepaints: { count: number } }).__layerRepaints = state
  const proto = CanvasRenderingContext2D.prototype
  const original = proto.clearRect
  proto.clearRect = function patched(...args: Parameters<typeof original>) {
    state.count++
    return original.apply(this, args)
  }
}

async function repaintCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __layerRepaints: { count: number } }).__layerRepaints.count,
  )
}

/**
 * Waits for the pre-drag settle to actually finish, instead of guessing a
 * fixed delay: bundled-font (ppb.ttf) loading can trigger a legitimate
 * settle repaint, and a fixed sleep either races it (flaky fail) or pads the
 * test with dead time. Two conditions, both observable in-page:
 *
 * 1. `document.fonts.ready` — resolves once font loading/layout for the
 *    document has settled.
 * 2. The repaint counter itself holds steady across several consecutive
 *    animation frames — the actual signal under test ("no more repaints
 *    pending"), polled via `requestAnimationFrame` rather than a wall-clock
 *    sleep.
 */
async function waitForRepaintsToSettle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => {
    const state = (window as unknown as { __layerRepaints: { count: number } }).__layerRepaints
    const REQUIRED_STABLE_FRAMES = 5
    return new Promise<void>((resolve) => {
      let previous = state.count
      let stableFrames = 0
      const check = () => {
        if (state.count === previous) {
          stableFrames += 1
          if (stableFrames >= REQUIRED_STABLE_FRAMES) {
            resolve()
            return
          }
        } else {
          previous = state.count
          stableFrames = 0
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  })
}

test('dragging one element does not repaint the other elements’ canvas layers', async ({
  page,
}) => {
  await page.addInitScript(CLEAR_RECT_COUNTER)
  await page.goto(dragRepaintSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(4)
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const toClient = (point: { x: number; y: number }) => ({
    x: box.x + (point.x / DRAG_REPAINT_CANVAS.width) * box.width,
    y: box.y + (point.y / DRAG_REPAINT_CANVAS.height) * box.height,
  })
  const start = toClient({ x: DRAG_REPAINT_TARGET.centerX, y: DRAG_REPAINT_TARGET.centerY })

  // Press first, then settle: pointerdown selects the rectangle, which is
  // allowed to repaint layers (selection overlay). Only the moves that follow
  // are under test.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await expect(page.getByTestId('property-panel-selection')).toContainText('rectangle')
  await waitForRepaintsToSettle(page)

  const before = await repaintCount(page)
  const STEPS = 10
  for (let step = 1; step <= STEPS; step++) {
    await page.mouse.move(start.x + step * 6, start.y + step * 4)
  }
  const during = (await repaintCount(page)) - before
  await page.mouse.up()

  // The rectangle itself is an SVG-layer element, so a correct drag repaints
  // no canvas layer at all. Pre-fix this was 3 layers x 10 moves = 30.
  expect(during).toBe(0)
})
