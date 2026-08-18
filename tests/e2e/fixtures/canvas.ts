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

/**
 * Drag from one canvas-coordinate point to another via a *real touch*
 * gesture, injected through the Chrome DevTools Protocol
 * (`Input.dispatchTouchEvent`) rather than `page.mouse` — Playwright's
 * `page.mouse` always synthesizes mouse-type pointer events, which are never
 * subject to CSS `touch-action` gesture arbitration. Only a genuine touch
 * input runs through Chromium's real touch-vs-scroll decision, which is
 * exactly the mechanism issue #149 is about ("browser claims the gesture").
 *
 * Requires a browser context created with `hasTouch: true` (`test.use({
 * hasTouch: true })`) — without it Chromium has no touch input stack to
 * dispatch into.
 */
export async function touchDragCanvasPoint(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  canvasSize: { width: number; height: number },
  options?: { steps?: number; settleMs?: number },
): Promise<void> {
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const start = toClientPoint(box, from, canvasSize)
  const end = toClientPoint(box, to, canvasSize)
  const steps = options?.steps ?? 8
  const settleMs = options?.settleMs ?? 16

  const client = await page.context().newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y }],
    })
    await page.waitForTimeout(settleMs)
    for (let i = 1; i <= steps; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / steps,
            y: start.y + ((end.y - start.y) * i) / steps,
          },
        ],
      })
      await page.waitForTimeout(settleMs)
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await client.detach().catch(() => {})
  }
}

/**
 * Low-level multi-touch CDP session for gestures {@link touchDragCanvasPoint}
 * can't express: introducing or removing individual touch points mid-gesture
 * (a second finger landing while a drag is in progress, or a real two-finger
 * pan/pinch). Canvas-space points are converted to client pixels via the
 * paper's bounding box, same conversion the other helpers here use.
 *
 * `run` gets a `dispatch` function taking the *full* current set of active
 * touch points on every call — matching `Input.dispatchTouchEvent`'s own
 * model, where Chromium diffs against the previous dispatch by `id` to work
 * out what's new/moved/gone. Reuse the same `id` across calls for a point
 * that's continuing; simply add or drop entries to introduce or end touches.
 */
export async function withTouchGesture(
  page: Page,
  canvasSize: { width: number; height: number },
  run: (session: {
    toClient: (point: { x: number; y: number }) => { x: number; y: number }
    dispatch: (
      type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
      points: { x: number; y: number; id: number }[],
    ) => Promise<void>
    settle: (ms?: number) => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const client = await page.context().newCDPSession(page)
  try {
    await run({
      toClient: (point) => toClientPoint(box, point, canvasSize),
      dispatch: async (type, points) => {
        await client.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map(({ x, y, id }) => ({ x, y, id })),
        })
      },
      settle: (ms = 16) => page.waitForTimeout(ms),
    })
  } finally {
    await client.detach().catch(() => {})
  }
}

/**
 * Move the mouse to a canvas-coordinate point without pressing a button —
 * drives the pointermove hover path (cursor affordance) in DesignerCanvas.
 */
export async function hoverCanvasPoint(
  page: Page,
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
): Promise<void> {
  const paper = await canvasPaper(page)
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  const target = toClientPoint(box, point, canvasSize)
  await page.mouse.move(target.x, target.y)
}
