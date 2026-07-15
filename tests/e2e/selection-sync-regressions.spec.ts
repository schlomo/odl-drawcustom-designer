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
 * Regression specs for the two confirmed selection-sync bugs (2026-07
 * architecture review). Both are `test.fixme` — they reproduce real bugs on
 * `main` today and are expected to fail until `fix/selection-sync-mapping`
 * (a parallel PR) lands; `test.fixme` skips the body entirely so this suite
 * stays green in the meantime. Flip these to `test(...)` once that fix
 * merges (see PR description for merge order).
 */

const CANVAS = { width: 400, height: 300 }

test.beforeEach(async ({ page }) => {
  await page.goto(smokeSharePath())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

// Issue #15: findListItemSpans (src/ui/editor/yamlIssueRanges.ts) only
// recognizes block-style `- ` list items. A flow-style top-level array
// parses fine but yields zero spans, so locateElementStartInYaml returns
// null for every index and the canvas -> YAML scroll silently no-ops.
test.fixme(
  'canvas click scrolls to the element even when the top-level YAML array is flow-style (#15)',
  async ({ page }) => {
    // Padding must be (a) real elements, not comments — `elements` round-trips
    // through the app's own re-serializer shortly after commit (e.g. the
    // very click this test performs also nudges canvasDragging, which
    // re-triggers a canvas -> YAML re-sync), and comments don't survive that
    // round-trip — and (b) each on its own physical line, so each becomes its
    // own `.cm-line` (a flow sequence can span many lines and still be
    // "flow-style": no line may start with `- `, which is all
    // findListItemSpans checks for).
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

// Issue #14: handleCursorPosition (src/ui/components/YamlPanel.tsx) resolves
// cursor -> element index against the *live* CodeMirror doc synchronously,
// while the committed `elements` array only updates via a debounced,
// whole-document `payloadSchema.safeParse` that fails atomically. While one
// element is mid-invalid-edit, a structural edit elsewhere (inserting a new
// element) shifts live-doc line positions out from under the frozen
// `elements` array, so clicking a later element's YAML block can select the
// wrong element in the property panel / element list.
test.fixme(
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
