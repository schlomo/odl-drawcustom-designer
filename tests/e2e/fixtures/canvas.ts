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

function toClientPoint(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: box.x + (point.x / canvasSize.width) * box.width,
    y: box.y + (point.y / canvasSize.height) * box.height,
  }
}

/**
 * Drag from one canvas-coordinate point to another via real pointer events
 * (mouse down, a couple of intermediate moves, mouse up) — the pointerdown
 * hit-test and drag-session wiring under test (DesignerCanvas.tsx) only runs
 * off real pointer events, not synthetic clicks.
 */
export async function dragCanvasPoint(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  canvasSize: { width: number; height: number },
): Promise<void> {
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const start = toClientPoint(box, from, canvasSize)
  const end = toClientPoint(box, to, canvasSize)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const steps = 5
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / steps,
      start.y + ((end.y - start.y) * i) / steps,
    )
  }
  await page.mouse.up()
}
