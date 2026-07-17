import { expect, test } from '@playwright/test'
import { clickCanvasPoint } from './fixtures/canvas'
import {
  SMOKE_CANVAS,
  SMOKE_CIRCLE,
  SMOKE_RECT,
  smokeSharePath,
} from './fixtures/share-payload'
import {
  deleteFirstColonInYamlLine,
  restoreColonInYamlLine,
  yamlLineContaining,
} from './fixtures/yaml-editor'

/**
 * Issue #35 — visual editing is blocked while the YAML doc is broken.
 *
 * On unfixed main, breaking the document (deleting a `:`) froze `elements`
 * at last-valid, and the next canvas pointerdown (toggling `canvasDragging`)
 * re-ran YamlPanel's external-sync effect, which unconditionally rewrote the
 * editor with the stale serialization — silently discarding the user's
 * in-progress edit. This flow needs a real browser: real pointer events on
 * the canvas racing a real CodeMirror EditorView through React state toggles
 * (ADR-011's exact e2e scope).
 */

const BROKEN_TYPE_LINE = 'type rectangle' // `- type: rectangle` after deleting the colon

test('breaking the YAML blocks canvas/property editing without reverting the edit; fixing it resumes', async ({
  page,
}) => {
  await page.goto(smokeSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  // Select the rectangle (via YAML cursor coupling on its `type` line) so we
  // can later prove the blocked canvas click does not steal the selection
  // and the property panel visibly locks.
  await yamlLineContaining(page, 'type: rectangle').first().click()
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_RECT.typeLabel)

  // Break the document: `- type: rectangle` -> `- type rectangle`.
  const colonColumn = await deleteFirstColonInYamlLine(page, 'type: rectangle')

  // The blocked overlays appear (after the ~400ms visual grace period —
  // Playwright's auto-waiting absorbs it).
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeVisible()
  await expect(page.getByTestId('canvas-blocked-overlay')).toContainText('YAML has errors')
  await expect(page.getByTestId('property-panel-blocked-overlay')).toBeVisible()

  // Property inputs are disabled while blocked.
  await expect(page.getByTestId('property-input-x_end')).toBeDisabled()

  // A canvas click on the circle is inert: selection stays on the rectangle...
  await clickCanvasPoint(page, { x: SMOKE_CIRCLE.x, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_RECT.typeLabel)

  // ...and — the data-loss repro — the in-progress edit survives: the editor
  // still shows the broken line instead of the reverted last-valid
  // serialization (on unfixed main the pointerdown's canvasDragging toggle
  // rewrote the doc to `- type: rectangle` here).
  await expect(yamlLineContaining(page, BROKEN_TYPE_LINE)).toHaveCount(1)

  // Fix the YAML: restore the colon.
  await restoreColonInYamlLine(page, BROKEN_TYPE_LINE, colonColumn)
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeHidden()
  await expect(page.getByTestId('property-panel-blocked-overlay')).toBeHidden()

  // Editing resumes: the same canvas click now selects the circle.
  await clickCanvasPoint(page, { x: SMOKE_CIRCLE.x, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_CIRCLE.typeLabel)
})
