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
