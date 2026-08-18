import { expect, test } from '@playwright/test'
import { canvasPaper, clickCanvasPoint, touchDragCanvasPoint, withTouchGesture } from './fixtures/canvas'
import { yamlContent } from './fixtures/yaml-editor'
import {
  TOUCH_DRAG_CANVAS,
  TOUCH_DRAG_RECT,
  TOUCH_DRAG_RECT_A,
  TOUCH_DRAG_RECT_B,
  touchDragSharePath,
  touchMultiTouchSharePath,
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
 * Follow-up (same maintainer tablet validation pass, PR #153): the paper-only
 * `touch-action: none` left the surrounding viewport padding (the maintainer's
 * primary marquee-start spot, since the showcase demo's debug_grid covers the
 * whole paper) just as contested as before, and a second finger landing
 * during a gesture fell through to the same pointer handlers as the first,
 * hijacking selection/drag. Both are covered below.
 *
 * These specs force `zoomMode: '100'` (never `'fit'`, which always shrinks
 * the canvas to avoid scroll) against an oversized 1000x1000 canvas, so the
 * viewport is genuinely scrollable regardless of the runner's window size —
 * exactly the precondition for the browser to have a pan to claim. Requires
 * a real touch input stack (`hasTouch: true`) — `page.mouse` is mouse-type
 * and never subject to `touch-action` arbitration at all.
 */

test.use({ hasTouch: true })

async function forceZoom100(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    (key: string) => window.localStorage.setItem(key, '100'),
    CANVAS_ZOOM_STORAGE_KEY,
  )
}

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

test.describe('single-finger gestures', () => {
  test.beforeEach(async ({ page }) => {
    await forceZoom100(page)
    await page.goto(touchDragSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
  })

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
    await touchDragCanvasPoint(page, { x: 200, y: 160 }, { x: 0, y: 0 }, TOUCH_DRAG_CANVAS)

    await expect(page.getByTestId('property-panel-selection')).toContainText(
      TOUCH_DRAG_RECT.typeLabel,
    )
  })

  test('marquee-selecting starting on the viewport padding (outside the paper) by touch selects the enclosed element (#149 follow-up)', async ({
    page,
  }) => {
    // The maintainer's primary marquee workflow on a real design: the
    // showcase demo's debug_grid covers the entire canvas, so there is no
    // empty spot *inside* the paper to start a marquee from — only the
    // scroll padding around the stage works with a mouse. Start point is
    // negative canvas-space (outside the paper, inside the ~24px scroll
    // padding — `CANVAS_VIEWPORT_PADDING_PX` in `canvas-zoom.ts`), well away
    // from the paper's edge so it can't land on the paper by rounding.
    await clickCanvasPoint(page, { x: 180, y: 5 }, TOUCH_DRAG_CANVAS)
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)

    await touchDragCanvasPoint(page, { x: -15, y: -15 }, { x: 200, y: 200 }, TOUCH_DRAG_CANVAS)

    await expect(page.getByTestId('property-panel-selection')).toContainText(
      TOUCH_DRAG_RECT.typeLabel,
    )
  })
})

test.describe('multi-touch inertness (#149 follow-up)', () => {
  test.beforeEach(async ({ page }) => {
    await forceZoom100(page)
    await page.goto(touchMultiTouchSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(2)
    await canvasPaper(page)
  })

  test('a second finger landing during a drag never selects or moves the element under it', async ({
    page,
  }) => {
    const yamlBefore = await yamlContent(page).textContent()
    expect(yamlBefore).toContain(`x_start: ${TOUCH_DRAG_RECT_B.x_start}`)

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const aStart = toClient({ x: TOUCH_DRAG_RECT_A.centerX, y: TOUCH_DRAG_RECT_A.centerY })
      const aMid = toClient({
        x: TOUCH_DRAG_RECT_A.centerX + 40,
        y: TOUCH_DRAG_RECT_A.centerY + 30,
      })
      const bTouch = toClient({ x: TOUCH_DRAG_RECT_B.centerX, y: TOUCH_DRAG_RECT_B.centerY })
      const bMoved = toClient({
        x: TOUCH_DRAG_RECT_B.centerX + 40,
        y: TOUCH_DRAG_RECT_B.centerY + 30,
      })

      // Finger 1 (primary) touches down on A and starts dragging it.
      await dispatch('touchStart', [{ ...aStart, id: 1 }])
      await settle()
      await dispatch('touchMove', [{ ...aMid, id: 1 }])
      await settle()

      // A is now selected and mid-drag.
      await expect(page.getByTestId('property-panel-selection')).toContainText('#1')

      // Finger 2 (non-primary) lands on B while finger 1 is still down, and
      // then tries to drag B — the bug: every finger fires pointerdown /
      // pointermove into the same session handlers, so this used to
      // hijack selection onto B and move it.
      await dispatch('touchStart', [{ ...aMid, id: 1 }, { ...bTouch, id: 2 }])
      await settle()
      await dispatch('touchMove', [{ ...aMid, id: 1 }, { ...bMoved, id: 2 }])
      await settle()

      await dispatch('touchEnd', [])
    })

    // Selection must still be A (#1), never B (#2).
    await expect(page.getByTestId('property-panel-selection')).toContainText('#1')

    // B never moved — the second finger was completely inert.
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toContain(`x_start: ${TOUCH_DRAG_RECT_B.x_start}`)

    // A's own drag (finger 1) still worked normally despite the interruption.
    expect(yamlAfter).not.toContain(`x_start: ${TOUCH_DRAG_RECT_A.x_start}`)
  })
})

test.describe('two-finger navigation (#155)', () => {
  test.beforeEach(async ({ page }) => {
    await forceZoom100(page)
    await page.goto(touchDragSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
  })

  test('a 2-finger drag pans the canvas viewport without moving or selecting anything', async ({
    page,
  }) => {
    const before = await viewportScroll(page)
    expect(before.canScroll).toBe(true)
    expect(before.scrollTop).toBe(0)
    const yamlBefore = await yamlContent(page).textContent()

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      // Both fingers land on empty canvas, away from the rectangle
      // (20,20 - 140,140), and drag "up" together — content follows the
      // fingers, so this pans the viewport down (increasing scrollTop),
      // exactly like a native single-finger touch scroll would if one were
      // still allowed here (it isn't — #149 follow-up moved all touch
      // panning to this 2-finger gesture).
      const p1Start = toClient({ x: 300, y: 100 })
      const p2Start = toClient({ x: 340, y: 140 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()

      const steps = 5
      const dy = -100
      for (let i = 1; i <= steps; i++) {
        const stepDy = (dy * i) / steps
        await dispatch('touchMove', [
          { x: p1Start.x, y: p1Start.y + stepDy, id: 1 },
          { x: p2Start.x, y: p2Start.y + stepDy, id: 2 },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })

    const after = await viewportScroll(page)
    expect(after.scrollTop).toBeGreaterThan(before.scrollTop + 50)

    // Navigation only — never an element gesture.
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
  })

  test('a pinch-out gesture zooms the canvas in without moving or selecting anything', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: '100%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const yamlBefore = await yamlContent(page).textContent()

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      // Two fingers straddling a point on empty canvas, spreading apart —
      // pinch-out zooms in, anchored at the gesture midpoint. Comfortably
      // clears PINCH_ZOOM_STEP_RATIO (1.4x) in one step: 60 units apart
      // growing to 120.
      const p1Start = toClient({ x: 170, y: 60 })
      const p2Start = toClient({ x: 230, y: 60 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()

      const p1End = toClient({ x: 140, y: 60 })
      const p2End = toClient({ x: 260, y: 60 })
      const steps = 5
      for (let i = 1; i <= steps; i++) {
        await dispatch('touchMove', [
          {
            x: p1Start.x + ((p1End.x - p1Start.x) * i) / steps,
            y: p1Start.y,
            id: 1,
          },
          {
            x: p2Start.x + ((p2End.x - p2Start.x) * i) / steps,
            y: p2Start.y,
            id: 2,
          },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })

    await expect(page.getByRole('button', { name: '200%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Navigation only — never an element gesture.
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
  })
})
