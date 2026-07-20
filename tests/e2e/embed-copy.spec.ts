import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #76: Copy PNG / Copy YAML in embed mode (demo host page).
 *
 * On secure origins both copies must land on the clipboard. On insecure
 * origins (LAN-IP http, file://) `navigator.clipboard` does not exist:
 * Copy YAML must still work via the execCommand fallback, and Copy PNG —
 * which has no insecure-context clipboard path — must fail with a visible,
 * specific reason instead of a bare red flash.
 *
 * Served by the embed webServer (python3 http.server on dist-lib), same as
 * embed-mount.spec.ts. The insecure origin is simulated by deleting the
 * clipboard API surface before page scripts run — Playwright cannot browse
 * a genuinely insecure remote origin from localhost.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

// Toolbars render hidden measure-only duplicates of each button (ADR-016);
// target the visible one.
const exportButton = (page: Page, actionId: string) =>
  page.locator(`[data-export-action="${actionId}"]:visible`).first()

async function openDemoHostPage(page: Page): Promise<void> {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
}

test.describe('embed copy on a secure origin (localhost)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('Copy YAML puts the payload YAML on the clipboard', async ({ page }) => {
    await openDemoHostPage(page)

    await exportButton(page, 'copy-yaml').click()

    await expect(exportButton(page, 'copy-yaml')).toHaveClass(/shell-success/)
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain("{{ states('sensor.demo_temperature') }} °C")
  })

  test('Copy PNG puts an image/png item on the clipboard', async ({ page }) => {
    await openDemoHostPage(page)

    await exportButton(page, 'copy-png').click()

    await expect(exportButton(page, 'copy-png')).toHaveClass(/shell-success/)
    const clipboardTypes = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      return items.flatMap((item) => [...item.types])
    })
    expect(clipboardTypes).toContain('image/png')
  })
})

test.describe('embed copy on an insecure origin (no navigator.clipboard)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.Navigator.prototype, 'clipboard', {
        get: () => undefined,
        configurable: true,
      })
      // @ts-expect-error simulating an insecure browsing context
      delete window.ClipboardItem
      Object.defineProperty(window, 'isSecureContext', { get: () => false })
    })
    await openDemoHostPage(page)
  })

  test('Copy YAML still works via the execCommand fallback', async ({ page, context }) => {
    await exportButton(page, 'copy-yaml').click()

    await expect(exportButton(page, 'copy-yaml')).toHaveClass(/shell-success/)

    // Read the clipboard from a fresh page WITHOUT the stub — the fallback
    // must have written to the real clipboard, not just flashed green.
    const reader = await context.newPage()
    await reader.goto(embedUrl())
    const clipboard = await reader.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain("{{ states('sensor.demo_temperature') }} °C")
    await reader.close()
  })

  test('Copy PNG fails with a visible secure-context explanation, not a bare red flash', async ({
    page,
  }) => {
    await exportButton(page, 'copy-png').click()

    await expect(exportButton(page, 'copy-png')).toHaveClass(/shell-danger/)
    await expect(page.getByRole('alert')).toHaveText('Clipboard requires HTTPS or localhost')
  })
})
