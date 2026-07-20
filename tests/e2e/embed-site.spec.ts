import { expect, test, type Page } from '@playwright/test'

/**
 * Assembled-site suite (issue #69): exercises the exact layout GitHub Pages
 * serves — `npm run build:site` output with the standalone app at `/` and
 * the embed demo at `/embed/`. The dist-lib suite (embed-mount.spec.ts)
 * proves the library bundle works served at a root; this suite proves the
 * same demo still mounts under the `/embed/` subpath in the assembled
 * dist/ — a broken (absolute) reference would resolve against `/` and 404,
 * which the vitest assembly checks (tests/tools/assembleSite.test.ts) can
 * only lint for, not actually load.
 *
 * Served by the third Playwright webServer (python3 http.server on dist/,
 * port PW_SITE_PORT — see playwright.config.ts).
 */

const siteUrl = (path: string) => `http://localhost:${process.env.PW_SITE_PORT}${path}`

interface LoadFailures {
  consoleErrors: string[]
  requestFailures: string[]
}

/** Must be called before page.goto — listeners only see traffic after attach. */
function trackLoadFailures(page: Page): LoadFailures {
  const failures: LoadFailures = { consoleErrors: [], requestFailures: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') failures.consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    failures.requestFailures.push(`${request.url()} — ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.requestFailures.push(`${response.url()} — HTTP ${response.status()}`)
    }
  })
  return failures
}

test('/embed/ mounts the designer from the assembled site without load failures', async ({
  page,
}) => {
  const failures = trackLoadFailures(page)

  await page.goto(siteUrl('/embed/'))

  // Same observable outcomes embed-mount.spec.ts proves against dist-lib:
  // demo payload rendered, capabilities push landed, fonts self-contained.
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  await expect(page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
  await expect(page.getByText('Font failed to load')).toHaveCount(0)

  // Subpath regression guard: every fetch resolved under /embed/ — no 404s,
  // no console errors from a failed module load.
  expect(failures.requestFailures).toEqual([])
  expect(failures.consoleErrors).toEqual([])
})

test('/ serves the standalone app at the site root', async ({ page }) => {
  await page.goto(siteUrl('/'))

  // Standalone chrome: canvas paper plus the share-link button the embed
  // deliberately hides (embed-mount.spec.ts asserts its absence there).
  await expect(page.locator('[data-canvas-paper]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy share link' })).toBeVisible()
})
