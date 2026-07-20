import { expect, test } from '@playwright/test'
import { dragCanvasPoint } from './fixtures/canvas'

/**
 * Issue #79: the Linked-editor scroll (EditorView.scrollIntoView with
 * y:'center' in YamlEditor.tsx) must never scroll the HOST page in embed
 * mode. CodeMirror's default scroll handling walks ancestor scrollers past
 * the mount boundary and calls window.scrollBy on the host document when the
 * target YAML line cannot be centered inside the editor's own scroller.
 *
 * PR #78 removed the standalone shell's scroll slack, which hid the bug
 * there — but an embed host page legitimately scrolls (content above/below
 * the designer), so the designer must contain its scrolling itself.
 *
 * The demo host page (demo/index.html) stands in for a real host: sticky
 * header, the designer at 85vh, and host content below it that gives the
 * document genuine scroll slack in both directions.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

// Demo capabilities push: 296x128 BWR panel.
const CANVAS = { width: 296, height: 128 }

// Inside the demo rectangle (4,4)-(200,70), clear of both text elements.
const RECT_GRAB = { x: 170, y: 62 }

async function hostScrollState(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
}

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('dragging an element never scrolls the host page (#79)', async ({ page }) => {
  const before = await hostScrollState(page)
  // The assertion is only meaningful when the host document really can
  // scroll — the demo page keeps content below the designer for exactly
  // this reason.
  expect(before.scrollHeight - before.innerHeight).toBeGreaterThan(100)
  expect(before.scrollY).toBe(0)

  // Drag the rectangle: selection flips mid-gesture, Linked mode syncs the
  // YAML editor and asks CodeMirror to center the rectangle's block.
  await dragCanvasPoint(page, RECT_GRAB, { x: RECT_GRAB.x + 20, y: RECT_GRAB.y + 15 }, CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText('rectangle')

  const after = await hostScrollState(page)
  expect(after.scrollY).toBe(before.scrollY)
})

test('selection sync never scrolls a pre-scrolled host page (#79)', async ({ page }) => {
  // Host user has scrolled the page: the designer sits mid-viewport with
  // slack in BOTH directions, so any window.scrollBy — up or down — is
  // detectable.
  await page.evaluate(() => window.scrollTo(0, 120))
  const before = await hostScrollState(page)
  expect(before.scrollY).toBe(120)

  await dragCanvasPoint(page, RECT_GRAB, { x: RECT_GRAB.x + 20, y: RECT_GRAB.y + 15 }, CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText('rectangle')

  const after = await hostScrollState(page)
  expect(after.scrollY).toBe(before.scrollY)
})
