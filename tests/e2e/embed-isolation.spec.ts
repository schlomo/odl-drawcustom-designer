import { expect, test, type Page } from '@playwright/test'

/**
 * Style isolation via Shadow DOM (issue #21), proven against the real
 * library bundle on a deliberately hostile host page (demo/isolation.html):
 * `!important` color/font rules on `*`, Tailwind-colliding utility class
 * names, and two designer instances with different themes. Playwright CSS
 * locators pierce open shadow roots, so `#designer-light .cm-content` etc.
 * address designer internals directly.
 */

const isolationUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/isolation.html`

// index.css light/dark shell palette, as computed rgb() strings.
const LIGHT_TEXT = 'rgb(15, 23, 42)' // --shell-text  #0f172a
const LIGHT_BG = 'rgb(248, 250, 252)' // --shell-bg    #f8fafc
const DARK_BG = 'rgb(15, 23, 42)' // --shell-bg    #0f172a (dark)
const HOSTILE_RED = 'rgb(255, 0, 0)'

async function computed(page: Page, selector: string, property: string): Promise<string> {
  return page.locator(selector).first().evaluate(
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    property,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto(isolationUrl())
  await expect(page.locator('#designer-light [data-testid="element-list-row"]')).toHaveCount(1)
  await expect(page.locator('#designer-dark [data-testid="element-list-row"]')).toHaveCount(1)
})

test('hostile host styles do not reach the designer', async ({ page }) => {
  // The host page paints every element red Comic Sans with letter-spacing;
  // the designer heading must keep its own palette and font stack.
  const heading = '#designer-light h1'
  expect(await computed(page, heading, 'color')).toBe(LIGHT_TEXT)
  expect(await computed(page, heading, 'font-family')).not.toMatch(/Comic Sans/i)
  expect(await computed(page, heading, 'letter-spacing')).not.toBe('4px')

  // The host redefines `.flex { display: block }` — the designer's own
  // Tailwind utilities must still win inside the shadow root.
  expect(await computed(page, '#designer-light div.flex', 'display')).toBe('flex')
})

test('designer styles do not leak into the host page', async ({ page }) => {
  // Host element squatting on Tailwind class names keeps its host styling.
  expect(await computed(page, '#host-probe', 'display')).toBe('block')
  expect(await computed(page, '#host-probe', 'color')).toBe(HOSTILE_RED)
  expect(await computed(page, '#host-probe', 'padding-top')).toBe('0px')

  // The compiled stylesheet lives in the shadow roots, never in <head>, and
  // the designer never themes the host document.
  const leaked = await page.evaluate(() => ({
    headStyles: document.head.querySelectorAll('style[data-odl-designer-styles]').length,
    documentDark: document.documentElement.classList.contains('dark'),
  }))
  expect(leaked.headStyles).toBe(0)
  expect(leaked.documentDark).toBe(false)
})

test('two instances hold different themes at the same time', async ({ page }) => {
  const shellSelector = (id: string) => `#${id} [data-odl-designer-root] > div`

  await expect(page.locator('#designer-dark .dark')).toHaveCount(1)
  await expect(page.locator('#designer-light .dark')).toHaveCount(0)

  expect(await computed(page, shellSelector('designer-light'), 'background-color')).toBe(LIGHT_BG)
  expect(await computed(page, shellSelector('designer-dark'), 'background-color')).toBe(DARK_BG)
})

test('CodeMirror works inside the shadow root: focus, typing, styled autocomplete tooltip', async ({
  page,
}) => {
  const content = page.locator('#designer-light .cm-content')
  await content.click()
  await expect(content).toBeFocused()

  // Type a fresh line fragment; the autocomplete tooltip must open INSIDE
  // the shadow root (a document.body portal would render unstyled).
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Delete')
  await page.keyboard.type('- ty', { delay: 30 })

  const tooltip = page.locator('#designer-light .cm-tooltip-autocomplete')
  await expect(tooltip).toBeVisible()

  // Styled, not transparent fallback: the editor theme paints the tooltip.
  const escapedToBody = await page.evaluate(() =>
    [...document.body.children].some((el) => el.classList.contains('cm-tooltip')),
  )
  expect(escapedToBody).toBe(false)

  // The typed text landed in the real EditorView (measure/focus sanity).
  await expect(page.locator('#designer-light .cm-line', { hasText: '- ty' })).toHaveCount(1)
})
