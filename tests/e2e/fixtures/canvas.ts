import type { Locator, Page } from '@playwright/test'

/**
 * The canvas paper (`[data-canvas-paper]`, see DesignerCanvas.tsx) is a fixed
 * `renderContext.width x height` box scaled to fit the viewport via a CSS
 * `transform: scale(...)`. `getBoundingClientRect()` already reflects that
 * scale, so mapping a canvas-coordinate point to a page click point is a
 * simple linear ratio — no need to know the current zoom level.
 */
export async function canvasPaper(page: Page): Promise<Locator> {
  const paper = page.locator('[data-canvas-paper]')
  await paper.waitFor({ state: 'visible' })
  return paper
}

export async function clickCanvasPoint(
  page: Page,
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
  options?: Parameters<Page['mouse']['click']>[2],
): Promise<void> {
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const clientX = box.x + (point.x / canvasSize.width) * box.width
  const clientY = box.y + (point.y / canvasSize.height) * box.height
  await page.mouse.click(clientX, clientY, options)
}
