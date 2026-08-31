import { expect, test } from '@playwright/test'
import { dragCanvasPoint } from './fixtures/canvas'
import {
  MULTILINE_DRAG_CANVAS,
  MULTILINE_DRAG_ELEMENT,
  multilineDragSharePath,
} from './fixtures/multiline-drag-payload'
import { yamlContent } from './fixtures/yaml-editor'

/**
 * Maintainer report (real hardware): after moving a multiline element on the
 * canvas its line height came out wrong on the device. Root cause was in
 * `translateElement` (src/ui/lib/element-geometry.ts), which added the drag's
 * `dy` to `offset_y` as well as to `y` — but `offset_y` is "Vertical spacing
 * between lines" (docs/spec/supported_types.md), a typographic property the
 * server renderer honors, not a position.
 *
 * Vitest covers the transform itself. This spec exists because only a real
 * browser exercises the whole shipped path: a genuine pointer drag session in
 * `DesignerCanvas`, ADR-009's drag suspension (the elements -> editor sync is
 * held for the whole gesture and runs exactly once at pointerup), and the
 * resulting YAML document the user actually copies into Home Assistant. The
 * assertion is on that document — a drag must not smuggle a spacing change
 * into it.
 */

async function yamlNumber(
  page: import('@playwright/test').Page,
  key: string,
): Promise<number> {
  const text = (await yamlContent(page).textContent()) ?? ''
  const match = new RegExp(`(?:^|\\s)${key}:\\s*(-?\\d+)`).exec(text)
  if (!match) {
    throw new Error(`No \`${key}:\` found in the YAML document:\n${text}`)
  }
  return Number(match[1])
}

test('dragging a multiline element changes y in the YAML without touching offset_y', async ({
  page,
}) => {
  await page.goto(multilineDragSharePath())
  await expect(yamlContent(page)).toContainText('type: multiline')

  expect(await yamlNumber(page, 'y')).toBe(MULTILINE_DRAG_ELEMENT.y)
  expect(await yamlNumber(page, 'offset_y')).toBe(MULTILINE_DRAG_ELEMENT.offset_y)

  const dy = 60
  await dragCanvasPoint(
    page,
    { x: MULTILINE_DRAG_ELEMENT.grabX, y: MULTILINE_DRAG_ELEMENT.grabY },
    { x: MULTILINE_DRAG_ELEMENT.grabX, y: MULTILINE_DRAG_ELEMENT.grabY + dy },
    MULTILINE_DRAG_CANVAS,
  )

  // The drag must have actually moved the element — otherwise the offset_y
  // assertion below would pass vacuously on a missed hit-test.
  await expect
    .poll(() => yamlNumber(page, 'y'))
    .toBe(MULTILINE_DRAG_ELEMENT.y + dy)

  expect(await yamlNumber(page, 'offset_y')).toBe(MULTILINE_DRAG_ELEMENT.offset_y)
})
