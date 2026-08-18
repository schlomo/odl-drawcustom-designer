import { expect, test } from '@playwright/test'
import { canvasPaper, clickCanvasPoint, touchDragCanvasPoint } from './fixtures/canvas'
import { yamlContent } from './fixtures/yaml-editor'
import {
  TOUCH_DRAG_CANVAS,
  TOUCH_DRAG_RECT,
  touchDragSharePath,
} from './fixtures/touch-drag-payload'
// `src/ui/preferences/keys.ts` re-exports through `src/core/index.ts`, which
// also re-exports `buildInfo.ts` (`import.meta.env` access at module scope) —
// fine under Vite, but this spec runs through Playwright's own Node-side
// transform with no Vite env. Import the storage-key builder straight from
// its source module instead, and rebuild the same key
// (`${APP_SLUG}-canvas-zoom`) `keys.ts` defines.
import { storageKey } from '../../src/core/brand'

const CANVAS_ZOOM_STORAGE_KEY = storageKey('canvas-zoom')

/**
 * Issue #149 (maintainer observation, real tablet): elements cannot be
 * dragged by touch. The canvas viewport (`[data-testid="canvas-viewport"]`,
 * `overflow-auto` in DesignerCanvas.tsx) had no `touch-action` restriction on
 * the paper, so a single-finger touchmove starting on it is ambiguous to the
 * browser between "pan the scrollable viewport" and "drive our pointer-event
 * drag session" — Chromium is free to pick the former, which cancels the
 * pointer session (no more pointermove) and pans the container instead of
 * moving anything.
 *
 * These specs force `zoomMode: '100'` (never `'fit'`, which always shrinks
 * the canvas to avoid scroll) against an oversized 1000x1000 canvas, so the
 * viewport is genuinely scrollable regardless of the runner's window size —
 * exactly the precondition for the browser to have a pan to claim. Requires
 * a real touch input stack (`hasTouch: true`) — `page.mouse` is mouse-type
 * and never subject to `touch-action` arbitration at all.
 */

test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (key: string) => window.localStorage.setItem(key, '100'),
    CANVAS_ZOOM_STORAGE_KEY,
  )
  await page.goto(touchDragSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(1)
  await canvasPaper(page)
})

async function viewportScroll(page: import('@playwright/test').Page) {
  return page.getByTestId('canvas-viewport').evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
    // The bug can only manifest against a genuinely scrollable container —
    // assert this holds so a green run means "the browser had a pan to
    // claim and didn't", not "there was never anything to pan".
    canScroll: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
  }))
}

test('dragging an element by touch moves it (#149)', async ({ page }) => {
  const before = await viewportScroll(page)
  expect(before.canScroll).toBe(true)
  expect(before.scrollTop).toBe(0)
  expect(before.scrollLeft).toBe(0)

  const yamlBefore = await yamlContent(page).textContent()
  expect(yamlBefore).toContain(`x_start: ${TOUCH_DRAG_RECT.x_start}`)

  await touchDragCanvasPoint(
    page,
    { x: TOUCH_DRAG_RECT.centerX, y: TOUCH_DRAG_RECT.centerY },
    { x: TOUCH_DRAG_RECT.centerX + 60, y: TOUCH_DRAG_RECT.centerY + 40 },
    TOUCH_DRAG_CANVAS,
  )

  await expect(page.getByTestId('property-panel-selection')).toContainText(
    TOUCH_DRAG_RECT.typeLabel,
  )

  // The bug: the browser claims the touchmove for scrolling instead of
  // handing it to the drag session, so the element never moves and the
  // YAML is unchanged.
  await expect(async () => {
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).not.toContain(`x_start: ${TOUCH_DRAG_RECT.x_start}`)
  }).toPass({ timeout: 2000 })

  // A real element move, not a container pan standing in for one.
  const after = await viewportScroll(page)
  expect(after.scrollTop).toBe(0)
  expect(after.scrollLeft).toBe(0)
})

test('resizing an element by touch drag handle changes its bounds (#149)', async ({ page }) => {
  // Select the rectangle first — resize handles only render for a selection.
  await touchDragCanvasPoint(
    page,
    { x: TOUCH_DRAG_RECT.centerX, y: TOUCH_DRAG_RECT.centerY },
    { x: TOUCH_DRAG_RECT.centerX, y: TOUCH_DRAG_RECT.centerY },
    TOUCH_DRAG_CANVAS,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    TOUCH_DRAG_RECT.typeLabel,
  )

  const yamlBefore = await yamlContent(page).textContent()
  expect(yamlBefore).toContain(`x_end: ${TOUCH_DRAG_RECT.x_end}`)

  // Drag the bottom-right ("se") resize handle, which sits at (x_end, y_end).
  await touchDragCanvasPoint(
    page,
    { x: TOUCH_DRAG_RECT.x_end, y: TOUCH_DRAG_RECT.y_end },
    { x: TOUCH_DRAG_RECT.x_end + 60, y: TOUCH_DRAG_RECT.y_end + 60 },
    TOUCH_DRAG_CANVAS,
  )

  await expect(async () => {
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).not.toContain(`x_end: ${TOUCH_DRAG_RECT.x_end}`)
  }).toPass({ timeout: 2000 })
})

test('marquee-selecting on empty canvas by touch selects the enclosed element (#149)', async ({
  page,
}) => {
  // Force a known deselected baseline via a plain click on empty canvas
  // (mouse input, deliberately not the touch gesture under test) — a
  // share-hash import may or may not restore a prior selection, and that
  // restore mechanism isn't what this spec is about. Stays close to the
  // canvas origin: the 1000x1000 fixture canvas is deliberately larger than
  // the viewport can show at once (that's what makes it scrollable), so a
  // point far from the origin (e.g. mid-canvas) can fall outside the part of
  // the paper actually visible on screen.
  await clickCanvasPoint(page, { x: 180, y: 5 }, TOUCH_DRAG_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)

  // Empty point below-right of the rectangle, dragged up-left to fully
  // enclose it (rectangle spans 20,20 - 140,140) — both points stay on the
  // visible, top-left portion of the oversized canvas.
  await touchDragCanvasPoint(
    page,
    { x: 200, y: 160 },
    { x: 0, y: 0 },
    TOUCH_DRAG_CANVAS,
  )

  await expect(page.getByTestId('property-panel-selection')).toContainText(
    TOUCH_DRAG_RECT.typeLabel,
  )
})
