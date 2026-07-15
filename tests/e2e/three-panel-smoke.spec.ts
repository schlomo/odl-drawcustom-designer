import { expect, test } from '@playwright/test'
import { clickCanvasPoint } from './fixtures/canvas'
import { elementListRow } from './fixtures/element-list'
import {
  SMOKE_CANVAS,
  SMOKE_CIRCLE,
  SMOKE_RECT,
  SMOKE_TEXT,
  smokeSharePath,
} from './fixtures/share-payload'
import { blurYamlEditor, replaceYamlDocument, yamlLineContaining } from './fixtures/yaml-editor'

/**
 * Smoke suite for the real three-panel wiring (canvas <-> property panel <->
 * YAML editor) — see ADR-011's 2026-07-15 revision. Vitest/jsdom cannot drive
 * real pointer coordinates against CodeMirror's laid-out DOM or its debounced
 * sync, which is exactly the class of bug these tests exist to catch
 * (issues #14, #15). Each spec asserts an observable outcome (selection state,
 * a rendered row's text, canvas hit-test position) — never markup internals.
 *
 * All specs seed state via the `#d=` share-hash (ADR-005) with a small,
 * deliberately non-overlapping fixture (tests/e2e/fixtures/share-payload.ts)
 * rather than the built-in showcase demo, so click coordinates stay stable
 * regardless of how the showcase bundle evolves.
 */

test.beforeEach(async ({ page }) => {
  await page.goto(smokeSharePath())
  // The share-hash import is async (IndexedDB + mock/variable reads); wait for
  // the seeded elements to actually land before interacting.
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('loads a seeded share-hash payload and renders it on the canvas', async ({ page }) => {
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  await expect(elementListRow(page, SMOKE_RECT.typeLabel)).toBeVisible()
  await expect(elementListRow(page, SMOKE_CIRCLE.typeLabel)).toBeVisible()
  await expect(elementListRow(page, SMOKE_TEXT.typeLabel)).toBeVisible()

  const paper = page.locator('[data-canvas-paper]')
  const box = await paper.boundingBox()
  expect(box?.width).toBeGreaterThan(0)
  expect(box?.height).toBeGreaterThan(0)
})

test('clicking an element on the canvas selects it in the property panel and element list', async ({
  page,
}) => {
  await clickCanvasPoint(page, { x: SMOKE_CIRCLE.x, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)

  await expect(page.getByTestId('property-panel-selection')).toContainText(
    `#${SMOKE_CIRCLE.index + 1}`,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_CIRCLE.typeLabel)

  const selectedRow = page.getByTestId('element-list-row').and(page.locator('[aria-pressed="true"]'))
  await expect(selectedRow).toHaveCount(1)
  await expect(selectedRow).toContainText(SMOKE_CIRCLE.typeLabel)
})

test('clicking a different element block in the YAML editor moves selection to it', async ({
  page,
}) => {
  // Start from the circle selected (via canvas), then click into the text
  // element's YAML block — selection should follow the YAML click, not stay
  // on the circle.
  await clickCanvasPoint(page, { x: SMOKE_CIRCLE.x, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_CIRCLE.typeLabel)

  await yamlLineContaining(page, SMOKE_TEXT.value).click()

  await expect(page.getByTestId('property-panel-selection')).toContainText(
    `#${SMOKE_TEXT.index + 1}`,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_TEXT.typeLabel)

  const selectedRow = page.getByTestId('element-list-row').and(page.locator('[aria-pressed="true"]'))
  await expect(selectedRow).toContainText(SMOKE_TEXT.typeLabel)
})

test('editing a property value in the property panel updates the canvas', async ({ page }) => {
  await clickCanvasPoint(
    page,
    { x: SMOKE_RECT.centerX, y: SMOKE_RECT.centerY },
    SMOKE_CANVAS,
  )
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_RECT.typeLabel)

  const xEndInput = page.getByTestId('property-input-x_end')
  await xEndInput.fill('240')
  await xEndInput.blur()

  await expect(elementListRow(page, SMOKE_RECT.typeLabel)).toContainText('240')

  // Geometric proof, not just the row label: a point that only falls inside
  // the *new* (wider) rectangle now hits it on the canvas (and is far enough
  // from the circle's center that it isn't a circle hit instead).
  const newEdgePoint = { x: 200, y: SMOKE_RECT.centerY }
  await clickCanvasPoint(page, newEdgePoint, SMOKE_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_RECT.typeLabel)
})

test('editing YAML text updates the canvas', async ({ page }) => {
  // Move the circle far enough that its old hit-test position (radius 50
  // around the original center) no longer overlaps the new one.
  const movedX = 340
  await replaceYamlDocument(
    page,
    [
      `- type: rectangle`,
      `  x_start: ${SMOKE_RECT.x_start}`,
      `  x_end: ${SMOKE_RECT.x_end}`,
      `  y_start: ${SMOKE_RECT.y_start}`,
      `  y_end: ${SMOKE_RECT.y_end}`,
      `  fill: black`,
      `  outline: black`,
      `  width: 2`,
      `- type: circle`,
      `  x: ${movedX}`,
      `  y: ${SMOKE_CIRCLE.y}`,
      `  radius: ${SMOKE_CIRCLE.radius}`,
      `  fill: red`,
      `  outline: black`,
      `  width: 2`,
      `- type: text`,
      `  value: ${SMOKE_TEXT.value}`,
      `  x: ${SMOKE_TEXT.x}`,
      `  y: ${SMOKE_TEXT.y}`,
      `  size: 24`,
      `  color: black`,
      ``,
    ].join('\n'),
  )
  await blurYamlEditor(page)

  await expect(elementListRow(page, SMOKE_CIRCLE.typeLabel)).toContainText(`${movedX}`)

  // The circle no longer hit-tests at its old position (nothing else covers
  // it, so the click lands on empty canvas and clears selection)...
  await clickCanvasPoint(page, { x: SMOKE_CIRCLE.x, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)
  await expect(page.getByText('Select an element from the list or canvas.')).toBeVisible()

  // ...but does at its new one.
  await clickCanvasPoint(page, { x: movedX, y: SMOKE_CIRCLE.y }, SMOKE_CANVAS)
  await expect(page.getByTestId('property-panel-selection')).toContainText(SMOKE_CIRCLE.typeLabel)
})
