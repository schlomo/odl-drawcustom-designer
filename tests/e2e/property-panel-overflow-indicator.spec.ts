import { expect, test, type Locator, type Page } from '@playwright/test'
import { canvasPaper, clickCanvasPoint } from './fixtures/canvas'
import {
  DRAG_SCROLL_CANVAS,
  DRAG_TARGET_BAR,
  dragScrollSharePath,
} from './fixtures/drag-scroll-payload'

/**
 * Issue #84: the property panel gives no hint that more fields exist below
 * the fold. Contract: when the panel's inner scroller overflows vertically,
 * a fade indicator appears at the bottom edge (more content below) and at
 * the top edge once scrolled down; each disappears at its end stop, and
 * neither renders when the content fits. Works in standalone and embed
 * (shadow DOM) alike, without changing the scroller's metrics.
 */

function panelScroller(page: Page): Locator {
  return page
    .locator('aside')
    .filter({ has: page.getByTestId('property-panel-selection') })
    .locator('.overflow-y-auto')
}

async function expectVerticalOverflow(scroller: Locator) {
  const metrics = await scroller.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(
    metrics.scrollHeight,
    'fixture must overflow vertically for this test to be meaningful',
  ).toBeGreaterThan(metrics.clientHeight)
}

async function scrollToBottom(scroller: Locator) {
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
}

test.describe('standalone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(dragScrollSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(41)
    await canvasPaper(page)
  })

  test('long form: bottom fade visible until scrolled to the end, then top fade takes over', async ({
    page,
  }) => {
    await clickCanvasPoint(
      page,
      { x: DRAG_TARGET_BAR.centerX, y: DRAG_TARGET_BAR.centerY },
      DRAG_SCROLL_CANVAS,
    )
    await expect(page.getByTestId('property-panel-selection')).toContainText('progress_bar')

    const scroller = panelScroller(page)
    await expectVerticalOverflow(scroller)

    // Not scrolled: more content below → bottom fade only.
    await expect(page.getByTestId('property-panel-overflow-bottom')).toBeVisible()
    await expect(page.getByTestId('property-panel-overflow-top')).toHaveCount(0)

    // Scrolled to the end: nothing below any more → top fade only.
    await scrollToBottom(scroller)
    await expect(page.getByTestId('property-panel-overflow-bottom')).toHaveCount(0)
    await expect(page.getByTestId('property-panel-overflow-top')).toBeVisible()
  })

  test('short form that fits shows no overflow indicator', async ({ page }) => {
    // Tall enough viewport that the rectangle form genuinely fits — the
    // "content fits" case must not show any affordance.
    await page.setViewportSize({ width: 1280, height: 1200 })
    // The share-hash loader leaves element 0 selected — a tiny rectangle
    // with a short property form (the fixture's no-slack baseline).
    await expect(page.getByTestId('property-panel-selection')).toContainText('rectangle')

    const scroller = panelScroller(page)
    const metrics = await scroller.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(
      metrics.scrollHeight,
      'fixture form must fit for this test to be meaningful',
    ).toBeLessThanOrEqual(metrics.clientHeight)

    await expect(page.getByTestId('property-panel-overflow-bottom')).toHaveCount(0)
    await expect(page.getByTestId('property-panel-overflow-top')).toHaveCount(0)
  })

  test('indicator overlays leave the scroller metrics untouched (issue #83 stays fixed)', async ({
    page,
  }) => {
    await clickCanvasPoint(
      page,
      { x: DRAG_TARGET_BAR.centerX, y: DRAG_TARGET_BAR.centerY },
      DRAG_SCROLL_CANVAS,
    )
    await expect(page.getByTestId('property-panel-selection')).toContainText('progress_bar')
    await expect(page.getByTestId('property-panel-overflow-bottom')).toBeVisible()

    const metrics = await panelScroller(page).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  })
})

test.describe('embed demo', () => {
  test('long form: bottom fade visible, hidden after scrolling to the end', async ({ page }) => {
    await page.goto(`http://localhost:${process.env.PW_EMBED_PORT}/`)
    await expect(page.getByTestId('element-list-row')).toHaveCount(3)

    await page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' }).click()
    await expect(page.getByTestId('property-panel-selection')).toContainText('text')

    const scroller = panelScroller(page)
    await expectVerticalOverflow(scroller)

    await expect(page.getByTestId('property-panel-overflow-bottom')).toBeVisible()

    await scrollToBottom(scroller)
    await expect(page.getByTestId('property-panel-overflow-bottom')).toHaveCount(0)
    await expect(page.getByTestId('property-panel-overflow-top')).toBeVisible()
  })
})
