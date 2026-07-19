import { expect, test } from '@playwright/test'

/**
 * M3 acceptance test (issue #20): the demo host page (demo/, shipped inside
 * dist-lib by the library build) loads the single-file library bundle,
 * mounts the designer, pushes fake states + capabilities and receives the
 * payload via onSaveRequest. This exercises the real embed wiring end to
 * end — library bundle self-containment (fonts, styles, React), host pushes
 * through the MountHandle, and the Save round-trip — none of which
 * Vitest/jsdom can prove against the built artifact.
 *
 * Served by the second Playwright webServer (python3 http.server on
 * dist-lib, port PW_EMBED_PORT — see playwright.config.ts).
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('mounts self-contained: capabilities drive the canvas, host states drive template preview', async ({
  page,
}) => {
  // Capabilities push (296x128 BWR) landed on the display config.
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
  await expect(page.getByLabel('Color mode')).toHaveValue('bwr')

  // Host-pushed states evaluated into the template preview.
  await expect(page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' })).toBeVisible()
  await expect(page.getByTestId('element-list-row').filter({ hasText: 'Balcony' })).toHaveCount(0)

  // Bundled fonts must come out of the single-file bundle, not a /fonts/
  // fetch a host page cannot serve (this failed before fonts were inlined).
  await expect(page.getByText('Font failed to load')).toHaveCount(0)

  // Embedded chrome: Save offered, share link (standalone-only) absent.
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.getByLabel('Copy share link')).toHaveCount(0)
})

test('a later host states push re-evaluates the template preview', async ({ page }) => {
  await page.getByRole('button', { name: 'Push cold states' }).click()

  await expect(page.getByTestId('element-list-row').filter({ hasText: '3.2 °C' })).toBeVisible()
  await expect(page.getByTestId('element-list-row').filter({ hasText: 'Balcony' })).toBeVisible()
})

test('editing an element and hitting Save hands the payload YAML to the host', async ({
  page,
}) => {
  await page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' }).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText('text')

  const xInput = page.getByTestId('property-input-x')
  await xInput.fill('42')
  await xInput.blur()

  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const saved = page.getByTestId('saved-payload')
  await expect(saved).toContainText("{{ states('sensor.demo_temperature') }} °C")
  await expect(saved).toContainText('x: 42')
})

test('theme select switches the designer without touching the host document', async ({
  page,
}) => {
  await page.locator('#theme').selectOption('dark')

  await expect(page.locator('#designer .dark')).toHaveCount(1)
  const documentDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )
  expect(documentDark).toBe(false)
})
