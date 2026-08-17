import { expect, test } from '@playwright/test'

/**
 * Host state push mid-drag, real browser (issue #110 follow-up; Copilot
 * review on PR #114): `tests/embed/host-states-push-diff.test.ts` proves
 * *state isolation* — `applyStates` never touches `elements`/
 * `selectedIndices`/the edit-history ref — but it does so by calling the
 * `useProjectState` hook's coalescing methods directly, with no real
 * `DesignerCanvas` drag session, frozen-elements overlay, or pointer
 * capture involved. That is a real, useful guarantee, but it is not proof
 * that an actual in-progress canvas drag survives a host push untouched.
 *
 * This spec is that proof: drag an element on the real canvas of the demo
 * host page (`demo/host.js`, served from the built library), fire a host
 * `setStates()` push through `window.designerHandle` while the pointer is
 * still down and captured, then finish the drag and assert the element
 * lands at its true final position — no snap-back to the pre-drag position,
 * no jump from a stale baseline — and that the pushed state is applied once
 * the gesture ends.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

// Demo host page canvas (demo/host.js): the single 296x128 BWR display target
// pushed at mount (KITCHEN_TARGET) sizes the drawing surface.
const CANVAS_SIZE = { width: 296, height: 128 }

function toClientPoint(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: box.x + (point.x / CANVAS_SIZE.width) * box.width,
    y: box.y + (point.y / CANVAS_SIZE.height) * box.height,
  }
}

test('a host states push mid-drag lands the drag at its true final position and applies afterward', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  // Snap-to-grid is on by default (10px grid) and would round the dragged
  // rectangle's final coordinates, making the "reflects the full drag"
  // assertion below ambiguous. Turn it off so the asserted numbers are the
  // raw drag delta, not a grid-snapped approximation.
  const snapToggle = page.getByRole('button', { name: 'Snap' })
  await snapToggle.click()
  await expect(snapToggle).toHaveAttribute('aria-pressed', 'false')

  const paper = page.locator('[data-canvas-paper]')
  await paper.waitFor({ state: 'visible' })
  const box = await paper.boundingBox()
  if (!box) {
    throw new Error('[data-canvas-paper] has no bounding box — is the canvas rendered?')
  }

  // The demo payload's rectangle spans x_start/y_start 4,4 -> x_end/y_end
  // 200,70 and stacks above both text elements, so its interior at (150, 20)
  // — clear of both short text strings — is reliably hit-testable.
  const start = toClientPoint(box, { x: 150, y: 20 })
  const mid = toClientPoint(box, { x: 170, y: 30 })
  const end = toClientPoint(box, { x: 190, y: 40 })

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(mid.x, mid.y)
  await expect(page.getByTestId('property-panel-selection')).toContainText('rectangle')

  // Proves the push genuinely lands mid-gesture: DesignerCanvas's own
  // internal drag-session state — not a Playwright-side assumption about
  // the mouse button — drives the paper's cursor style live. `grabbing`
  // only renders while `dragSession` is non-null (DesignerCanvas.tsx), so
  // this is real evidence the drag is in flight, not merely that the mouse
  // button happens to be held.
  await expect(paper).toHaveCSS('cursor', 'grabbing')

  // The host state push (issue #110) lands mid-drag, before the gesture
  // completes. Routed through `window.demoPushStates` (demo/host.js) rather
  // than calling `designerHandle.setStates()` directly: the demo page's
  // live 1s ticker re-pushes clock + its own recorded "current" states on
  // every tick, so a push that bypasses that recording (a raw `setStates()`
  // call) is invisible to the ticker and gets silently clobbered by the
  // very next tick — a real, observed race (Copilot review on PR #128).
  // `demoPushStates` is the single source of truth the ticker reads from,
  // so this push survives every subsequent tick by construction.
  await page.evaluate(() => {
    ;(
      window as unknown as {
        demoPushStates: (states: unknown) => void
      }
    ).demoPushStates({
      'sensor.demo_temperature': {
        state: '3.2',
        attributes: { friendly_name: 'Balcony', unit_of_measurement: '°C' },
      },
    })
  })

  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  // Final position reflects the FULL drag (dx +40, dy +20 in canvas
  // coordinates) — no snap-back to the pre-drag position (4,4)-(200,70), no
  // jump from a stale baseline the mid-drag push might have reset.
  await expect(page.getByTestId('property-input-x_start')).toHaveValue('44')
  await expect(page.getByTestId('property-input-x_end')).toHaveValue('240')
  await expect(page.getByTestId('property-input-y_start')).toHaveValue('24')
  await expect(page.getByTestId('property-input-y_end')).toHaveValue('90')

  // The pushed state was applied once the gesture ended, not dropped or
  // deferred.
  await expect(page.getByTestId('element-list-row').filter({ hasText: '3.2 °C' })).toBeVisible()
  await expect(page.getByTestId('element-list-row').filter({ hasText: 'Balcony' })).toBeVisible()
})
