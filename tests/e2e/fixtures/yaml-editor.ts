import type { Page } from '@playwright/test'

/** The CodeMirror 6 contenteditable root mounted by src/ui/editor/YamlEditor.tsx. */
export function yamlContent(page: Page) {
  return page.locator('.cm-content')
}

/** One rendered source line (`.cm-line`) whose text includes `text`. */
export function yamlLineContaining(page: Page, text: string) {
  return page.locator('.cm-line', { hasText: text })
}

/**
 * Replace the entire YAML document via real keyboard input (select all,
 * delete, type) — exercises the actual CodeMirror EditorView, which is the
 * point of testing this in a real browser instead of Vitest/jsdom.
 */
export async function replaceYamlDocument(page: Page, nextYaml: string): Promise<void> {
  const content = yamlContent(page)
  await content.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(nextYaml)
}

/** Blur the editor (flushes the debounced YAML -> elements sync immediately). */
export async function blurYamlEditor(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'YAML' }).click()
}

/**
 * Place the cursor at `column` within the first `.cm-line` containing
 * `lineText`, via real click + keyboard navigation (Home, then ArrowRight).
 */
export async function placeCursorInYamlLine(
  page: Page,
  lineText: string,
  column: number,
): Promise<void> {
  await yamlLineContaining(page, lineText).first().click()
  await page.keyboard.press('Home')
  for (let i = 0; i < column; i += 1) {
    await page.keyboard.press('ArrowRight')
  }
}

/**
 * Delete the first `:` in the line containing `lineText` — the canonical
 * "break the YAML" edit for issue #35 (e.g. `- type: rectangle` becomes the
 * unparseable `- type rectangle`). Returns the colon's column so the caller
 * can restore it with {@link restoreColonInYamlLine}.
 */
export async function deleteFirstColonInYamlLine(page: Page, lineText: string): Promise<number> {
  const line = yamlLineContaining(page, lineText).first()
  const text = (await line.textContent()) ?? ''
  const colonColumn = text.indexOf(':')
  if (colonColumn < 0) {
    throw new Error(`No ':' found in YAML line containing ${JSON.stringify(lineText)}`)
  }
  await placeCursorInYamlLine(page, lineText, colonColumn)
  await page.keyboard.press('Delete')
  return colonColumn
}

/** Re-insert a `:` at `column` in the (now colon-less) line containing `lineText`. */
export async function restoreColonInYamlLine(
  page: Page,
  lineText: string,
  column: number,
): Promise<void> {
  await placeCursorInYamlLine(page, lineText, column)
  await page.keyboard.insertText(':')
}
