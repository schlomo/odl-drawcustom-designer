import { expect, test, type Locator, type Page } from '@playwright/test'
import { canvasPaper, clickCanvasPoint } from './fixtures/canvas'
import {
  DRAG_SCROLL_CANVAS,
  DRAG_TARGET_BAR,
  dragScrollSharePath,
} from './fixtures/drag-scroll-payload'

/**
 * Issue #83: the property panel showed a horizontal scrollbar (standalone and
 * embed) with a long-form element like progress_bar selected. Root cause: the
 * hidden ToolbarTooltip label of every TemplateToggleButton is an absolutely
 * positioned, `whitespace-nowrap` span centered on a button that sits at the
 * panel's right edge — even while `visibility: hidden` it kept its layout box
 * and inflated the inner scroller's scrollable overflow (`overflow-y-auto`
 * makes the scroller's overflow-x compute to `auto`, so the slack surfaced as
 * a real horizontal scrollbar).
 *
 * Contract: the panel's inner scroller must have no horizontal overflow —
 * `scrollWidth <= clientWidth` — from MIN_PROPERTY_WIDTH (240) through the
 * default width, in standalone and embed alike.
 */

const PANEL_WIDTH_KEY = 'odl-drawcustom-designer-property-panel-width'
const MIN_PROPERTY_WIDTH = 240

/** The properties panel's inner vertical scroller (standalone or embed/shadow DOM). */
function panelScroller(page: Page): Locator {
  return page
    .locator('aside')
    .filter({ has: page.getByTestId('property-panel-selection') })
    .locator('.overflow-y-auto')
}

async function expectNoHorizontalOverflow(scroller: Locator) {
  const metrics = await scroller.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(
    metrics.scrollWidth,
    `panel scroller must not overflow horizontally (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth)
}

async function selectProgressBar(page: Page) {
  await page.goto(dragScrollSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(41)
  await canvasPaper(page)
  await clickCanvasPoint(
    page,
    { x: DRAG_TARGET_BAR.centerX, y: DRAG_TARGET_BAR.centerY },
    DRAG_SCROLL_CANVAS,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText('progress_bar')
}

test('standalone: progress_bar form fits the panel at default width', async ({ page }) => {
  await selectProgressBar(page)
  await expectNoHorizontalOverflow(panelScroller(page))
})

test('standalone: progress_bar form fits the panel at minimum width', async ({ page }) => {
  await page.addInitScript(
    ([key, width]) => localStorage.setItem(key!, width!),
    [PANEL_WIDTH_KEY, String(MIN_PROPERTY_WIDTH)],
  )
  await selectProgressBar(page)
  await expectNoHorizontalOverflow(panelScroller(page))
})

test('embed demo: selected element form fits the panel', async ({ page }) => {
  await page.goto(`http://localhost:${process.env.PW_EMBED_PORT}/`)
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' }).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText('text')

  await expectNoHorizontalOverflow(panelScroller(page))
})

test('embed demo: selected element form fits the panel at minimum width', async ({ page }) => {
  await page.addInitScript(
    ([key, width]) => localStorage.setItem(key!, width!),
    [PANEL_WIDTH_KEY, String(MIN_PROPERTY_WIDTH)],
  )
  await page.goto(`http://localhost:${process.env.PW_EMBED_PORT}/`)
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' }).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText('text')

  await expectNoHorizontalOverflow(panelScroller(page))
})
