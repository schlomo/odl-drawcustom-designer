import { expect, test } from '@playwright/test'
import { smokeSharePath } from './fixtures/share-payload'
import { deleteFirstColonInYamlLine, yamlLineContaining } from './fixtures/yaml-editor'

/**
 * Escaping a broken YAML document.
 *
 * Issue #35 blocks visual editing while the live document fails to parse:
 * `elements` freezes at last-valid, and the elements→editor sync refuses to
 * write over the editor because what it would write is a stale echo. That is
 * right for every control that EDITS the current design — but it also caught
 * "Clear all" and "Load Demo", which do not read the design at all, they
 * replace it. With both disabled, a document the user could not fix by hand
 * had no way out but manual YAML surgery.
 *
 * This belongs in a real browser (ADR-011's e2e scope): the whole point is a
 * real CodeMirror document being driven invalid by real keystrokes and then
 * replaced out from under itself, through the same external-sync effect that
 * is deliberately refusing to touch it. jsdom can assert the effect's decision
 * but not that the actual EditorView document ends up carrying the new design.
 *
 * The assertions are the recovery outcome — canvas, element list and editor
 * text all agreeing on the replacement, with the blocked state gone — not the
 * buttons' `disabled` attribute, which yaml-blocked-state.spec.ts covers.
 */

const BROKEN_TYPE_LINE = 'type rectangle' // `- type: rectangle` after deleting the colon

async function breakTheDocument(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(smokeSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await deleteFirstColonInYamlLine(page, 'type: rectangle')

  // Confirm we really are in the blocked state before testing the way out.
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeVisible()
  await expect(yamlLineContaining(page, BROKEN_TYPE_LINE)).toHaveCount(1)
}

test('Load Demo recovers from a broken YAML document', async ({ page }) => {
  await breakTheDocument(page)

  // Load Demo asks first — the user has unsaved work, broken or not.
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Replace the current design')
    void dialog.accept()
  })
  await page.getByRole('button', { name: 'Load Demo' }).click()

  // The demo is really loaded: the element list is the demo's, not the three
  // smoke elements, and the canvas is editable again.
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeHidden()
  await expect(page.getByTestId('property-panel-blocked-overlay')).toBeHidden()
  await expect(page.getByTestId('element-list-row')).not.toHaveCount(3)
  await expect(page.getByTestId('element-list-row').first()).toBeVisible()

  // The editor followed the replacement — the broken line is gone, and the
  // document parses (no lint/validation banner, add-element enabled again).
  await expect(yamlLineContaining(page, BROKEN_TYPE_LINE)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add text' })).toBeEnabled()
})

test('Clear all recovers from a broken YAML document', async ({ page }) => {
  await breakTheDocument(page)

  await page.getByRole('button', { name: 'Clear all' }).click()

  // The design is empty and the document is valid again.
  await expect(page.getByTestId('element-list-row')).toHaveCount(0)
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeHidden()
  await expect(page.getByTestId('property-panel-blocked-overlay')).toBeHidden()
  await expect(yamlLineContaining(page, BROKEN_TYPE_LINE)).toHaveCount(0)

  // Editing works again from the clean slate — the real proof the block lifted
  // rather than the overlay merely being hidden.
  await expect(page.getByRole('button', { name: 'Add text' })).toBeEnabled()
  await page.getByRole('button', { name: 'Add text' }).click()
  await expect(page.getByTestId('element-list-row')).toHaveCount(1)
})
