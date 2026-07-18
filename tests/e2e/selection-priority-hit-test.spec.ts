import { expect, test } from '@playwright/test'
import { clickCanvasPoint, dragCanvasPoint, hoverCanvasPoint } from './fixtures/canvas'
import { elementListRow } from './fixtures/element-list'
import {
  BURIED_CIRCLE,
  DEBUG_GRID_TYPE_LABEL,
  OCCLUDER_RECT,
  PRIORITY_CANVAS,
  debugGridPrioritySharePath,
  selectionPrioritySharePath,
} from './fixtures/selection-priority-payload'

/**
 * Issue #36: a selected element buried under a later, occluding element
 * (e.g. a full-canvas background rectangle, or the showcase demo's
 * `debug_grid`) must stay draggable/resizable on the canvas — selecting it
 * via the element list should not just highlight it in the property panel
 * but also let it be moved visually, even though plain topmost-wins
 * hit-testing would otherwise always resolve clicks to the occluder on top.
 *
 * This is real-pointer wiring (DesignerCanvas.tsx pointerdown -> hit test ->
 * drag session) that Vitest/jsdom's pure `findSelectionPriorityHit` unit
 * tests (tests/ui/lib/canvas-interaction.test.ts) do not exercise end to
 * end — see ADR-011's 2026-07-15 revision.
 */

test('selecting a buried element via the list keeps it draggable on canvas, and selection is retained', async ({
  page,
}) => {
  await page.goto(selectionPrioritySharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(2)

  // Select the buried circle via the element list (not the canvas, which the
  // full-canvas rectangle painted after it would otherwise always hit).
  await elementListRow(page, BURIED_CIRCLE.typeLabel).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    `#${BURIED_CIRCLE.index + 1}`,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    BURIED_CIRCLE.typeLabel,
  )

  // Selection priority is scoped to the selected element's own bounds: a
  // click well away from the circle (still on the rectangle) must fall back
  // to plain topmost-wins, not keep the circle selected everywhere.
  const awayFromCircle = { x: 250, y: 150 }
  await clickCanvasPoint(page, awayFromCircle, PRIORITY_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    OCCLUDER_RECT.typeLabel,
  )

  // Re-select the buried circle via the list, then drag on the canvas at its
  // (occluded) position. Selection priority should route the drag to the
  // selected circle, not the occluding rectangle on top of it.
  await elementListRow(page, BURIED_CIRCLE.typeLabel).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    BURIED_CIRCLE.typeLabel,
  )

  const dx = 60
  const dy = 40
  await dragCanvasPoint(
    page,
    { x: BURIED_CIRCLE.x, y: BURIED_CIRCLE.y },
    { x: BURIED_CIRCLE.x + dx, y: BURIED_CIRCLE.y + dy },
    PRIORITY_CANVAS,
  )

  // Moved: the element list row reflects the circle's new position.
  await expect(elementListRow(page, BURIED_CIRCLE.typeLabel)).toContainText(
    `${BURIED_CIRCLE.x + dx}`,
  )
  await expect(elementListRow(page, BURIED_CIRCLE.typeLabel)).toContainText(
    `${BURIED_CIRCLE.y + dy}`,
  )

  // Selection retained: still the circle, not the occluder.
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    BURIED_CIRCLE.typeLabel,
  )
  const selectedRow = page.getByTestId('element-list-row').and(page.locator('[aria-pressed="true"]'))
  await expect(selectedRow).toHaveCount(1)
  await expect(selectedRow).toContainText(BURIED_CIRCLE.typeLabel)
})

test('hover cursor shows the drag affordance for a selected element buried under a non-draggable occluder', async ({
  page,
}) => {
  // A debug_grid occluder is what distinguishes the pointermove (hover
  // cursor) routing: it hit-tests across the whole canvas but is not
  // draggable, so topmost-wins hover routing yields no grab affordance over
  // the buried circle, while selection-priority routing does. (With a
  // draggable occluder, both routings read `grab` and the wiring is
  // indistinguishable — Copilot review on PR #40.)
  await page.goto(debugGridPrioritySharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(2)

  const viewport = page.getByTestId('canvas-viewport')
  const circleCenter = { x: BURIED_CIRCLE.x, y: BURIED_CIRCLE.y }

  // Control: with the grid itself selected, hovering the circle's position
  // resolves to the selected non-draggable grid — no drag affordance.
  await elementListRow(page, DEBUG_GRID_TYPE_LABEL).click()
  // The property panel shows the raw type (`debug_grid`), the list row the
  // spaced label (`debug grid`).
  await expect(page.getByTestId('property-panel-selection')).toContainText('debug_grid')
  await hoverCanvasPoint(page, circleCenter, PRIORITY_CANVAS)
  await expect(viewport).toHaveCSS('cursor', 'default')

  // With the buried circle selected, hovering its occluded position must
  // show the drag affordance — only selection-priority hover routing does.
  await elementListRow(page, BURIED_CIRCLE.typeLabel).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText(
    BURIED_CIRCLE.typeLabel,
  )
  await hoverCanvasPoint(page, circleCenter, PRIORITY_CANVAS)
  await expect(viewport).toHaveCSS('cursor', 'grab')

  // Scope: away from the circle the non-draggable grid is the hit again.
  await hoverCanvasPoint(page, { x: 250, y: 150 }, PRIORITY_CANVAS)
  await expect(viewport).toHaveCSS('cursor', 'default')
})

test('Escape clears the selection and releases selection-priority routing', async ({ page }) => {
  // With a full-canvas occluder (the demo's debug_grid) there is no empty
  // canvas spot to click for deselection, and selection priority keeps
  // routing clicks within the selected element's bounds to it — Escape is
  // the escape hatch (maintainer request on PR #40).
  await page.goto(debugGridPrioritySharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(2)

  const selectedRow = page.getByTestId('element-list-row').and(page.locator('[aria-pressed="true"]'))
  const circleCenter = { x: BURIED_CIRCLE.x, y: BURIED_CIRCLE.y }

  await elementListRow(page, BURIED_CIRCLE.typeLabel).click()
  await expect(selectedRow).toHaveCount(1)

  // Scope control: Escape while the YAML editor has focus belongs to
  // CodeMirror, not the canvas — selection must survive. Click inside the
  // circle's own YAML block so the linked-mode cursor sync keeps the circle
  // selected.
  await page.locator('.cm-line', { hasText: 'radius' }).click()
  await expect(selectedRow).toContainText(BURIED_CIRCLE.typeLabel)
  await page.keyboard.press('Escape')
  await expect(selectedRow).toHaveCount(1)
  await expect(selectedRow).toContainText(BURIED_CIRCLE.typeLabel)

  // Escape from canvas/app scope clears the selection.
  await page.getByTestId('canvas-viewport').focus()
  await page.keyboard.press('Escape')
  await expect(selectedRow).toHaveCount(0)
  await expect(page.getByText('Select an element from the list or canvas.')).toBeVisible()

  // Priority routing released: the same click point now selects the
  // topmost occluder (the grid), not the previously selected circle.
  await clickCanvasPoint(page, circleCenter, PRIORITY_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText('debug_grid')
})
