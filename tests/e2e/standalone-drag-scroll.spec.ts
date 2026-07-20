import { expect, test } from '@playwright/test'
import { canvasPaper, clickCanvasPoint, dragCanvasPoint } from './fixtures/canvas'
import {
  DRAG_SCROLL_CANVAS,
  DRAG_TARGET_BAR,
  dragScrollSharePath,
} from './fixtures/drag-scroll-payload'

/**
 * Standalone scroll regression (maintainer report, 2026-07-20): dragging an
 * element on the canvas scrolled the whole page up, leaving a white band at
 * the bottom of the viewport — on a page that cannot be user-scrolled at all.
 *
 * Mechanism (two cooperating bugs, both proven by instrumented repro):
 *
 * 1. The hidden font-upload input in ElementPropertyForm (`sr-only`, i.e.
 *    `position: absolute`) takes its static position inside the properties
 *    panel's scrolled content, but its containing block is the panel `aside`
 *    (`relative`), so it escapes the panel's `overflow-y-auto` scroller.
 *    Selecting an element with a long form (e.g. progress_bar) parks it below
 *    the viewport and silently gives `document` scrollable slack.
 * 2. Selecting the element also triggers the Linked editor scroll
 *    (`EditorView.scrollIntoView`, YamlEditor). When the target YAML block
 *    sits too close to the document end to be centered inside the editor's
 *    own scroller, CodeMirror walks up the scrollable ancestors and calls
 *    `window.scrollBy` — which now finds the slack from (1) and scrolls the
 *    page.
 *
 * The app shell is `h-screen` with inner scrollers: the document itself must
 * never gain scrollable overflow, and no interaction may scroll the window.
 */

test.beforeEach(async ({ page }) => {
  await page.goto(dragScrollSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(41)
  await canvasPaper(page)
})

async function scrollState(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
}

test('dragging an element around the canvas never scrolls the page', async ({ page }) => {
  const before = await scrollState(page)
  expect(before.scrollY).toBe(0)

  // Grab the progress bar (unselected until pointerdown — selection flips
  // mid-gesture, exactly like the reported drag) and move it around.
  await dragCanvasPoint(
    page,
    { x: DRAG_TARGET_BAR.centerX, y: DRAG_TARGET_BAR.centerY },
    { x: DRAG_TARGET_BAR.centerX + 60, y: DRAG_TARGET_BAR.centerY - 40 },
    DRAG_SCROLL_CANVAS,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText('progress_bar')

  const after = await scrollState(page)
  expect(after.scrollY).toBe(0)
})

test('selecting an element with a long property form leaves no document scroll slack', async ({
  page,
}) => {
  await clickCanvasPoint(
    page,
    { x: DRAG_TARGET_BAR.centerX, y: DRAG_TARGET_BAR.centerY },
    DRAG_SCROLL_CANVAS,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText('progress_bar')

  // The white band exists exactly when the document can scroll at all: the
  // hidden upload input must not extend the page below the h-screen shell.
  const state = await scrollState(page)
  expect(state.scrollHeight).toBeLessThanOrEqual(state.innerHeight)
})
