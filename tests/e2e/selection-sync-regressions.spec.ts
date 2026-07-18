import { expect, test } from '@playwright/test'
import { clickCanvasPoint } from './fixtures/canvas'
import { smokeSharePath } from './fixtures/share-payload'
import {
  blurYamlEditor,
  replaceYamlDocument,
  yamlContent,
  yamlLineContaining,
} from './fixtures/yaml-editor'

/**
 * Regression specs for the confirmed selection-sync bugs (2026-07
 * architecture review). The mapping layer was fixed by the AST-backed
 * element↔YAML position mapping (#27: src/core/yaml/elementSpans.ts,
 * src/core/yaml/resolveCursorSelection.ts); the residual scroll wiring by
 * #37 (src/ui/editor/yamlEditorScroll.ts, yamlExternalSync.ts,
 * yamlScrollCommand.ts).
 *
 * All specs are live and pin the corrected behavior:
 * - #14: cursor→element resolution stays correct mid-invalid-edit.
 * - #15/#37: canvas click on a flow-style element scrolls the YAML pane to
 *   it (selection was already correct after #27; the scroll needed #37).
 * - #37 follow-up: re-clicking the already-selected element re-scrolls.
 */

const CANVAS = { width: 400, height: 300 }

test.beforeEach(async ({ page }) => {
  await page.goto(smokeSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

// Issue #15: the old regex line scanner (findListItemSpans) only recognized
// block-style `- ` list items, so a flow-style top-level array parsed fine
// but yielded zero spans and the canvas -> YAML scroll silently no-op'd.
// The AST-backed findElementSpans (src/core/yaml/elementSpans.ts, #27) maps
// flow-style elements too — the scroll must land on the element.
//
// The end-to-end flow-style jump additionally needed #37: the canvas click
// both selects the element AND starts a drag session; the canvasDragging
// toggle re-serializes the flow doc to block style into the editor, and that
// resync path (YamlEditor.tsx value-sync -> dispatchPreservingEditorViewState)
// used to restore the pre-click scrollTop after dispatching, clobbering its
// own scrollLinkedElementIntoView effect. Fixed by #37: the intentional
// linked-element scroll now wins over the view-state restore
// (skipScrollRestore in yamlEditorScroll.ts), and the scroll intent is
// captured when the sync pushes the text (shouldScrollLinkedElementOnSync in
// yamlExternalSync.ts) instead of being re-derived from already-reverted
// live state.
test(
  'canvas click scrolls to the element even when the top-level YAML array is flow-style (#15)',
  async ({ page }) => {
    // Padding must be (a) real elements, not comments — `elements` round-trips
    // through the app's own re-serializer shortly after commit (e.g. the
    // very click this test performs also nudges canvasDragging, which
    // re-triggers a canvas -> YAML re-sync), and comments don't survive that
    // round-trip — and (b) each on its own physical line, so each becomes its
    // own `.cm-line` (a flow sequence can span many lines and still be
    // "flow-style": no line starts with the block-style `- ` marker the old
    // regex scanner required).
    const padding = Array.from(
      { length: 40 },
      () => '  {type: line, x_start: 0, x_end: 1},',
    ).join('\n')
    await replaceYamlDocument(
      page,
      [
        '[',
        padding,
        '  {type: text, value: hi, x: 20, y: 20},',
        '  {type: circle, x: 200, y: 100, radius: 40}',
        ']',
        '',
      ].join('\n'),
    )
    await blurYamlEditor(page)
    await expect(page.getByTestId('element-list-row')).toHaveCount(42)

    // Jump to the document start (keyboard command — works even if the
    // bottom lines are virtualized out of the DOM after typing). The
    // circle is far below the fold from here, whether the document is
    // still flow-style or has since been reformatted to block style.
    await yamlContent(page).click()
    await page.keyboard.press('ControlOrMeta+Home')
    const circleLine = yamlLineContaining(page, 'radius: 40')
    await expect(circleLine).not.toBeInViewport()

    await clickCanvasPoint(page, { x: 200, y: 100 }, CANVAS)

    await expect(circleLine).toBeInViewport()
  },
)

// Follow-up to #37 (maintainer manual test of PR #41): clicking an element on
// the canvas must ALWAYS bring its YAML into view while coupling is on — even
// when the element is already selected and nothing about the document or the
// selection changes. A re-click produces no external text sync (serialized ==
// editor text) and no selection change (DesignerCanvas skips onSelectElement
// for an already-selected hit), so neither the sync-carried linked scroll nor
// the selectedIndex-keyed scroll command would re-fire on its own. Covered by
// the fresh-token elementScrollRequest path (DesignerCanvas
// onSelectedElementPointerDown -> App -> createYamlScrollCommand).
test(
  're-clicking the already-selected element on canvas scrolls its YAML back into view',
  async ({ page }) => {
    const padding = Array.from({ length: 40 }, () =>
      ['- type: line', '  x_start: 0', '  x_end: 1'].join('\n'),
    ).join('\n')
    await replaceYamlDocument(
      page,
      [padding, '- type: circle', '  x: 200', '  y: 100', '  radius: 40', ''].join('\n'),
    )
    await blurYamlEditor(page)
    await expect(page.getByTestId('element-list-row')).toHaveCount(41)

    // Cursor to the document start so the circle is below the fold and the
    // first canvas click is a real selection change (element 0 -> circle).
    await yamlContent(page).click()
    await page.keyboard.press('ControlOrMeta+Home')
    const circleLine = yamlLineContaining(page, 'radius: 40')
    await expect(circleLine).not.toBeInViewport()

    await clickCanvasPoint(page, { x: 200, y: 100 }, CANVAS)
    await expect(circleLine).toBeInViewport()

    // The user scrolls the YAML pane somewhere else...
    await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(circleLine).not.toBeInViewport()

    // ...then clicks the SAME element on the canvas again: selection does not
    // change, the document does not change — the pane must still jump back.
    await clickCanvasPoint(page, { x: 200, y: 100 }, CANVAS)
    await expect(circleLine).toBeInViewport()
  },
)

// Issue #14: handleCursorPosition used to resolve cursor -> element index
// against the *live* CodeMirror doc synchronously, while the committed
// `elements` array only updates via a debounced, whole-document schema parse
// that fails atomically. Mid-invalid-edit, a structural edit elsewhere
// (inserting a new element) shifted live-doc positions out from under the
// frozen `elements` array, so clicking a later element's block selected the
// wrong element (or none). resolveCursorSelection (#27) now defers instead
// of trusting a mismatched index — the click below must leave the circle
// shown in the property panel, whether it selects fresh or defers while the
// circle stays selected.
test(
  'clicking an element block selects that element even mid-invalid-edit elsewhere (#14)',
  async ({ page }) => {
    await replaceYamlDocument(
      page,
      [
        '- type: rectangle',
        '  x_start: 20',
        '  x_end: 140',
        '  y_start: 20',
        '  y_end: 140',
        '  fill: black',
        '- type: circle',
        '  x: 260',
        '  y: 80',
        '  radius: 50',
        '  fill: red',
        '',
      ].join('\n'),
    )
    await blurYamlEditor(page)
    await expect(page.getByTestId('element-list-row')).toHaveCount(2)

    // Corrupt the rectangle's `type` value (`rectangle` -> `xxx`) so the
    // whole-document schema parse fails and the committed `elements` array
    // freezes at its last valid (2-element) state.
    const rectangleLine = yamlLineContaining(page, 'type: rectangle')
    const rectangleBox = await rectangleLine.boundingBox()
    if (!rectangleBox) {
      throw new Error('rectangle YAML line not found')
    }
    await page.mouse.dblclick(
      rectangleBox.x + rectangleBox.width * 0.85,
      rectangleBox.y + rectangleBox.height / 2,
    )
    await page.keyboard.insertText('xxx')

    // Structural edit while still invalid: insert a brand-new element above
    // the circle, shifting its live-doc position without the frozen
    // `elements` array ever seeing the new layout.
    await yamlLineContaining(page, 'type: circle').click()
    await page.keyboard.press('Home')
    await page.keyboard.insertText('- type: text\n  value: injected\n  x: 5\n  y: 5\n')

    // Click into the (now shifted) circle block.
    await yamlLineContaining(page, 'radius: 50').click()

    await expect(page.getByTestId('property-panel-selection')).toContainText('circle')
  },
)
