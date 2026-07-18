import { expect, test } from '@playwright/test'
import { clickCanvasPoint } from './fixtures/canvas'
import { elementListRow } from './fixtures/element-list'
import {
  OVERFLOW_CANVAS,
  PADDING_COUNT,
  TARGET_CIRCLE,
  overflowListSharePath,
} from './fixtures/overflow-list-payload'

/**
 * Issue #44: the element-list panel never scrolled the selected row into
 * view. `layerPanelDisplayOrder` (src/ui/lib/draw-order.ts) shows front
 * (highest index, drawn last) at the top, so the fixture's circle — index 0,
 * drawn first — renders as the very last (bottom, off-screen) row behind 44
 * padding rectangles.
 *
 * A pre-existing, unrelated app quirk (present on unmodified `main` too):
 * loading a share-hash payload leaves `elements[0]` selected by default, and
 * `layerPanelDisplayOrder` puts that row last in the panel. Left alone, that
 * makes the circle already selected (and, with this fix, already scrolled
 * into view) before either spec ever touches the canvas — so each test first
 * selects a *different*, currently top-of-panel row to establish a known
 * baseline (selection away from the circle, scrolled near the top).
 */

test.beforeEach(async ({ page }) => {
  await page.goto(overflowListSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(PADDING_COUNT + 1)
})

test('clicking a far-down element on canvas scrolls its list row into view', async ({ page }) => {
  // Baseline: select the top-of-panel row (a padding rectangle), moving
  // selection — and the scroll position — away from the circle.
  await page.getByTestId('element-list-row').first().click()

  const circleRow = elementListRow(page, TARGET_CIRCLE.typeLabel)
  await expect(circleRow).not.toBeInViewport()

  await clickCanvasPoint(page, { x: TARGET_CIRCLE.x, y: TARGET_CIRCLE.y }, OVERFLOW_CANVAS)

  await expect(circleRow).toBeInViewport()
})

test('selecting an already-visible row does not move the list scroll container', async ({
  page,
}) => {
  const scroller = page.getByTestId('element-list-scroll')
  const firstRow = page.getByTestId('element-list-row').nth(0)
  const secondRow = page.getByTestId('element-list-row').nth(1)

  // Baseline: select the top row so the panel is scrolled near the top and
  // the next row down is already fully visible.
  await firstRow.click()
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true')
  await expect(secondRow).toBeInViewport()

  const scrollTopBefore = await scroller.evaluate((el) => el.scrollTop)
  await secondRow.click()
  await expect(secondRow).toHaveAttribute('aria-pressed', 'true')

  const scrollTopAfter = await scroller.evaluate((el) => el.scrollTop)
  expect(scrollTopAfter).toBe(scrollTopBefore)
})
