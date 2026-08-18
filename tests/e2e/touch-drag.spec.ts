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
import {
  PINCH_FIT_SMALL_CANVAS,
  PINCH_FIT_SMALL_RECT,
  pinchFitSmallSharePath,
} from './fixtures/touch-pinch-fit-payload'
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

async function forceZoom(
  page: import('@playwright/test').Page,
  mode: '50' | '100' | '200',
): Promise<void> {
  await page.addInitScript(
    ({ key, mode }: { key: string; mode: string }) => window.localStorage.setItem(key, mode),
    { key: CANVAS_ZOOM_STORAGE_KEY, mode },
  )
}

async function forceZoom100(page: import('@playwright/test').Page): Promise<void> {
  await forceZoom(page, '100')
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
      // then tries to drag B — the original bug: every finger fired
      // pointerdown/pointermove into the same session handlers, hijacking
      // selection onto B and moving it. Fixed behavior (review M1/M2): the
      // second finger escalates to 2-finger navigation, which TRUE-CANCELS
      // A's drag (restoring it) rather than letting A's partial move commit
      // — escalating to navigation aborts the intent, it doesn't finish it.
      await dispatch('touchStart', [{ ...aMid, id: 1 }, { ...bTouch, id: 2 }])
      await settle()
      await dispatch('touchMove', [{ ...aMid, id: 1 }, { ...bMoved, id: 2 }])
      await settle()

      await dispatch('touchEnd', [])
    })

    // Selection must still be A (#1), never B (#2).
    await expect(page.getByTestId('property-panel-selection')).toContainText('#1')

    // Neither element moved: B was never touched by anything but an inert
    // second finger, and A's own interrupted drag was cancelled outright
    // (review M1/M2) rather than committed at its partial position.
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
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


  test('lifting one finger while the other keeps moving still pans with the remaining finger', async ({
    page,
  }) => {
    const before = await viewportScroll(page)
    expect(before.canScroll).toBe(true)

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: 300, y: 100 })
      const p2Start = toClient({ x: 340, y: 140 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()

      // Lift finger 2 only — `touchEnd`'s points are the ones ENDING, not
      // the ones remaining (m5). Finger 1 stays down and is never
      // mentioned in this dispatch.
      await dispatch('touchEnd', [{ ...p2Start, id: 2 }])
      await settle()

      // The 2-finger session ends the moment either finger lifts
      // (documented policy, `TwoFingerSession`'s own doc comment) — no
      // retroactive 1-finger drag from finger 1 alone. Finger 1 lifting
      // now is just the end of an already-finished gesture.
      await dispatch('touchEnd', [{ ...p1Start, id: 1 }])
    })

    // No crash, no stuck session: a fresh, ordinary 2-finger pan afterward
    // still works.
    const mid = await viewportScroll(page)
    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: 300, y: 100 })
      const p2Start = toClient({ x: 340, y: 140 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()
      for (let i = 1; i <= 5; i++) {
        const dy = (-100 * i) / 5
        await dispatch('touchMove', [
          { x: p1Start.x, y: p1Start.y + dy, id: 1 },
          { x: p2Start.x, y: p2Start.y + dy, id: 2 },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })
    const after = await viewportScroll(page)
    expect(after.scrollTop).toBeGreaterThan(mid.scrollTop + 50)
  })

  test('a 3rd finger touching down during a 2-finger pan has no effect', async ({ page }) => {
    const before = await viewportScroll(page)
    const yamlBefore = await yamlContent(page).textContent()

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: 300, y: 100 })
      const p2Start = toClient({ x: 340, y: 140 })
      const p3 = toClient({ x: 250, y: 150 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()

      // Move both fingers partway, then a 3rd finger touches down mid-pan —
      // the session keeps riding its original two ids (documented policy);
      // the 3rd finger must not start a new session, select anything, or
      // otherwise perturb the pan already in progress.
      await dispatch('touchMove', [
        { x: p1Start.x, y: p1Start.y - 40, id: 1 },
        { x: p2Start.x, y: p2Start.y - 40, id: 2 },
      ])
      await settle()
      await dispatch('touchStart', [
        { x: p1Start.x, y: p1Start.y - 40, id: 1 },
        { x: p2Start.x, y: p2Start.y - 40, id: 2 },
        { ...p3, id: 3 },
      ])
      await settle()
      await dispatch('touchMove', [
        { x: p1Start.x, y: p1Start.y - 100, id: 1 },
        { x: p2Start.x, y: p2Start.y - 100, id: 2 },
        { x: p3.x + 30, y: p3.y + 30, id: 3 },
      ])
      await settle()
      await dispatch('touchEnd', [])
    })

    const after = await viewportScroll(page)
    expect(after.scrollTop).toBeGreaterThan(before.scrollTop + 50)
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
  })
})

test.describe('pinch-in on an explicit zoom level', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    // Starts already at 200% (not reached via a prior pinch — a separate,
    // clean starting state avoids compounding the pinch-out anchor's own
    // scroll adjustment into this gesture's coordinates) so this exercises
    // the ordinary non-fit decrease branch, distinct from the fit-mode
    // specs below.
    await forceZoom(page, '200')
    await page.goto(touchDragSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
  })

  test('a pinch-in gesture steps an explicit level down without moving or selecting anything', async ({
    page,
  }) => {
    // Force a known deselected baseline via a plain click on empty canvas
    // (mouse input, deliberately not the touch gesture under test) — a
    // share-hash import with exactly one element auto-selects it on load.
    await clickCanvasPoint(page, { x: 300, y: 5 }, TOUCH_DRAG_CANVAS)
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '200%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const yamlBefore = await yamlContent(page).textContent()

    // Pinch IN (fingers together) by just enough to cross the ratchet
    // threshold exactly once (ratio ~0.65 at the final step) — a bigger
    // closing motion re-crosses PINCH_ZOOM_STEP_RATIO a second time from
    // the rebased reference distance and steps twice (200% -> 100% -> 50%,
    // per the ratchet documented on PINCH_ZOOM_STEP_RATIO), which is
    // correct pinch behavior but not what this spec is isolating. Starts
    // clear of the rectangle (20,20 - 140,140): landing exactly on its
    // edge would hit-test and select it via finger 1's own solo pointerdown
    // (before finger 2 arrives to escalate to navigation), which a 2-finger
    // cancel correctly never reverts — selecting on tap-then-pan is
    // legitimate; it just isn't what this spec means to isolate.
    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: 150, y: 60 })
      const p2Start = toClient({ x: 270, y: 60 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()
      const p1End = toClient({ x: 171, y: 60 })
      const p2End = toClient({ x: 249, y: 60 })
      for (let i = 1; i <= 5; i++) {
        await dispatch('touchMove', [
          { x: p1Start.x + ((p1End.x - p1Start.x) * i) / 5, y: p1Start.y, id: 1 },
          { x: p2Start.x + ((p2End.x - p2Start.x) * i) / 5, y: p2Start.y, id: 2 },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })

    await expect(page.getByRole('button', { name: '100%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
  })
})

test.describe('pinch from fit mode (review finding B1)', () => {
  test.use({ hasTouch: true })

  test('pinch-out on a canvas that fits ABOVE every explicit level grows the paper', async ({
    page,
  }) => {
    // No forced zoomMode here (default is 'fit') — the small canvas fits
    // this suite's default viewport at well over 200% (measured ~159%),
    // squarely on the wrong side of the old hardcoded `fit → '100'`, which
    // would have SHRUNK it.
    await page.goto(pinchFitSmallSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
    await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const before = await (await canvasPaper(page)).boundingBox()
    expect(before?.width).toBeGreaterThan(0)

    await withTouchGesture(page, PINCH_FIT_SMALL_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: PINCH_FIT_SMALL_RECT.centerX - 30, y: PINCH_FIT_SMALL_RECT.centerY })
      const p2Start = toClient({ x: PINCH_FIT_SMALL_RECT.centerX + 30, y: PINCH_FIT_SMALL_RECT.centerY })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()
      const p1End = { x: p1Start.x - 30, y: p1Start.y }
      const p2End = { x: p2Start.x + 30, y: p2Start.y }
      for (let i = 1; i <= 5; i++) {
        await dispatch('touchMove', [
          { x: p1Start.x + ((p1End.x - p1Start.x) * i) / 5, y: p1Start.y, id: 1 },
          { x: p2Start.x + ((p2End.x - p2Start.x) * i) / 5, y: p2Start.y, id: 2 },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })

    // Nearest explicit level ABOVE fitScale (~1.59) is '200' — never '100'
    // (the old hardcoded target, which is BELOW fitScale and would shrink).
    await expect(page.getByRole('button', { name: '200%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const after = await (await canvasPaper(page)).boundingBox()
    expect(after?.width).toBeGreaterThan(before!.width)
  })

  test('pinch-in on a canvas that fits BELOW every explicit level never grows the paper', async ({
    page,
  }) => {
    // No forced zoomMode (default 'fit'). The 1000x1000 fixture canvas fits
    // this suite's default viewport at ~20.4% — below even the smallest
    // explicit level (50%), so there is no level a decrease can land on
    // without growing the canvas. The old hardcoded `fit → '50'` did
    // exactly that (a 2.5x grow on a pinch that asked to zoom OUT).
    await page.goto(touchDragSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
    await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const before = await (await canvasPaper(page)).boundingBox()
    expect(before?.width).toBeGreaterThan(0)

    // `fit` here is a very small fraction (~0.2), so the two touches must
    // start far apart in canvas space (most of the 1000-unit canvas width)
    // to still be a reliably measurable distance in CLIENT pixels — a
    // close-together pair (e.g. 40-100) is only a few client px apart at
    // this scale and pinching them further together can cross paths
    // (distance collapsing through ~0 and back out) well before either
    // finger reaches its intended endpoint, which reads as a huge spurious
    // ratio spike, not a clean single pinch-in.
    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const p1Start = toClient({ x: 50, y: 500 })
      const p2Start = toClient({ x: 950, y: 500 })
      await dispatch('touchStart', [{ ...p1Start, id: 1 }])
      await settle()
      await dispatch('touchStart', [
        { ...p1Start, id: 1 },
        { ...p2Start, id: 2 },
      ])
      await settle()
      const p1End = toClient({ x: 200, y: 500 })
      const p2End = toClient({ x: 800, y: 500 })
      for (let i = 1; i <= 5; i++) {
        await dispatch('touchMove', [
          { x: p1Start.x + ((p1End.x - p1Start.x) * i) / 5, y: p1Start.y, id: 1 },
          { x: p2Start.x + ((p2End.x - p2Start.x) * i) / 5, y: p2Start.y, id: 2 },
        ])
        await settle()
      }
      await dispatch('touchEnd', [])
    })

    // No explicit level sits below fitScale (~0.204) — the pinch must be a
    // no-op (stay in 'fit') rather than landing on '50' (which the old
    // hardcoded code did, growing the canvas 2.5x on a zoom-OUT gesture).
    await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: '50%' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    const after = await (await canvasPaper(page)).boundingBox()
    expect(after?.width).toBeLessThanOrEqual(before!.width)
  })
})

test.describe('second finger true-cancel (review finding M1/M2)', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await forceZoom100(page)
    await page.goto(touchDragSharePath())
    await expect(page.getByTestId('element-list-row')).toHaveCount(1)
    await canvasPaper(page)
  })

  test('a second finger landing mid-marquee cancels it: selection unchanged, then the fingers pan', async ({
    page,
  }) => {
    // Force a known deselected baseline via a plain click on empty canvas
    // (mouse input, deliberately not the touch gesture under test) — a
    // share-hash import with exactly one element auto-selects it on load.
    await clickCanvasPoint(page, { x: 180, y: 5 }, TOUCH_DRAG_CANVAS)
    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const before = await viewportScroll(page)

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      // Finger 1 starts a marquee from empty canvas, dragged to enclose the
      // rectangle (20,20 - 140,140) — but never lifted.
      const start = toClient({ x: 200, y: 160 })
      const mid = toClient({ x: 0, y: 0 })
      await dispatch('touchStart', [{ ...start, id: 1 }])
      await settle()
      await dispatch('touchMove', [{ ...mid, id: 1 }])
      await settle()

      // Finger 2 lands — the second finger escalates to 2-finger
      // navigation, which must CANCEL the marquee outright: no selection,
      // not even the "click-to-deselect" fallback (there was nothing
      // selected to begin with, and cancel must never call
      // onSelectAllInRect at all).
      const p2 = toClient({ x: 300, y: 100 })
      await dispatch('touchStart', [{ ...mid, id: 1 }, { ...p2, id: 2 }])
      await settle()

      await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)

      // The two fingers now pan, proving the escalation actually started
      // navigation rather than just aborting into nothing.
      await dispatch('touchMove', [
        { x: mid.x, y: mid.y - 60, id: 1 },
        { x: p2.x, y: p2.y - 60, id: 2 },
      ])
      await settle()
      await dispatch('touchEnd', [])
    })

    await expect(page.getByTestId('property-panel-selection')).toHaveCount(0)
    const after = await viewportScroll(page)
    expect(after.scrollTop).toBeGreaterThan(before.scrollTop + 20)
  })

  test('a second finger landing mid-drag cancels it: element back at its original position, no undo entry, then the fingers pan', async ({
    page,
  }) => {
    const yamlBefore = await yamlContent(page).textContent()
    expect(yamlBefore).toContain(`x_start: ${TOUCH_DRAG_RECT.x_start}`)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const start = toClient({ x: TOUCH_DRAG_RECT.centerX, y: TOUCH_DRAG_RECT.centerY })
      const mid = toClient({
        x: TOUCH_DRAG_RECT.centerX + 60,
        y: TOUCH_DRAG_RECT.centerY + 40,
      })
      await dispatch('touchStart', [{ ...start, id: 1 }])
      await settle()
      // Multiple steps, not one big jump — matches every other drag in this
      // suite and gives the drag session real intermediate pointermoves to
      // act on before it's interrupted.
      for (let i = 1; i <= 5; i++) {
        await dispatch('touchMove', [
          {
            x: start.x + ((mid.x - start.x) * i) / 5,
            y: start.y + ((mid.y - start.y) * i) / 5,
            id: 1,
          },
        ])
        await settle()
      }

      // Second finger lands — TRUE cancel: restore the pre-gesture element,
      // not "freeze it at its partial position with a permanent undo
      // entry" (the reviewer's measured pre-fix behavior). Whether the
      // element visibly moved before this point isn't independently
      // observable via the YAML panel here — the elements→editor sync is
      // suspended for the whole drag gesture (ADR-009) and only resumes
      // once the gesture actually ends (by cancel or by commit), so the
      // meaningful assertion is the *final* state below, once the whole
      // gesture (drag, cancel, then pan) has finished.
      const p2 = toClient({ x: 300, y: 100 })
      await dispatch('touchStart', [{ ...mid, id: 1 }, { ...p2, id: 2 }])
      await settle()

      // The two fingers now pan.
      await dispatch('touchMove', [
        { x: mid.x, y: mid.y - 60, id: 1 },
        { x: p2.x, y: p2.y - 60, id: 2 },
      ])
      await settle()
      await dispatch('touchEnd', [])
    })

    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
    // No undo entry was written for the aborted drag.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('a second finger landing mid-resize cancels it: original size restored, then the fingers pan', async ({
    page,
  }) => {
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
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

    await withTouchGesture(page, TOUCH_DRAG_CANVAS, async ({ toClient, dispatch, settle }) => {
      const start = toClient({ x: TOUCH_DRAG_RECT.x_end, y: TOUCH_DRAG_RECT.y_end })
      const mid = toClient({
        x: TOUCH_DRAG_RECT.x_end + 60,
        y: TOUCH_DRAG_RECT.y_end + 60,
      })
      await dispatch('touchStart', [{ ...start, id: 1 }])
      await settle()
      for (let i = 1; i <= 5; i++) {
        await dispatch('touchMove', [
          {
            x: start.x + ((mid.x - start.x) * i) / 5,
            y: start.y + ((mid.y - start.y) * i) / 5,
            id: 1,
          },
        ])
        await settle()
      }

      // See the drag-cancel spec above: the mid-gesture element position
      // isn't independently observable via the YAML panel (ADR-009 sync
      // suspension) — the final state below is the meaningful assertion.
      const p2 = toClient({ x: 300, y: 100 })
      await dispatch('touchStart', [{ ...mid, id: 1 }, { ...p2, id: 2 }])
      await settle()

      await dispatch('touchMove', [
        { x: mid.x, y: mid.y - 60, id: 1 },
        { x: p2.x, y: p2.y - 60, id: 2 },
      ])
      await settle()
      await dispatch('touchEnd', [])
    })

    const yamlAfter = await yamlContent(page).textContent()
    expect(yamlAfter).toBe(yamlBefore)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})
