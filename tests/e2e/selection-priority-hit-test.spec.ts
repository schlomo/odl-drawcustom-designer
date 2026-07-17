import { expect, test } from '@playwright/test'
import { clickCanvasPoint, dragCanvasPoint } from './fixtures/canvas'
import { elementListRow } from './fixtures/element-list'
import {
  BURIED_CIRCLE,
  OCCLUDER_RECT,
  PRIORITY_CANVAS,
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

test.beforeEach(async ({ page }) => {
  await page.goto(selectionPrioritySharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(2)
})

test('selecting a buried element via the list keeps it draggable on canvas, and selection is retained', async ({
  page,
}) => {
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
