import { expect, test } from '@playwright/test'

/**
 * Display config lock (issue #70) against the real library bundle on the demo
 * host page: the host mounts with a 296×128 BWR capabilities payload, so the
 * display config is host-owned — locked by default, unlockable as a virtual
 * display, and Load Demo keeps the host display while locked. Vitest covers
 * the state logic; this proves the flow through the built artifact. The
 * standalone app must stay lock-free.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

test.describe('embedded with host capabilities', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(embedUrl())
    await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  })

  test('host capabilities lock the display config behind a lock icon', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Unlock display config' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resolution' })).toBeDisabled()
    await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '90°' })).toBeDisabled()
  })

  test('unlock allows a manual change; re-lock restores the host values', async ({ page }) => {
    await page.getByRole('button', { name: 'Unlock display config' }).click()

    const colorMode = page.getByRole('combobox', { name: 'Color mode' })
    await expect(colorMode).toBeEnabled()
    await colorMode.selectOption('bw')
    await expect(colorMode).toHaveValue('bw')

    await page.getByRole('button', { name: 'Lock display config' }).click()

    await expect(colorMode).toHaveValue('bwr')
    await expect(colorMode).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
  })

  test('Load Demo while locked loads the demo payload but keeps the host display', async ({
    page,
  }) => {
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Load Demo' }).click()

    // Demo payload replaced the host payload (showcase has far more elements)…
    await expect
      .poll(async () => page.getByTestId('element-list-row').count())
      .toBeGreaterThan(3)
    // …but the display stays at the host-pushed 296×128 BWR, not showcase 800×480 four-color.
    await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
    await expect(page.getByRole('combobox', { name: 'Color mode' })).toHaveValue('bwr')
  })
})

test('standalone app shows no display config lock and keeps the controls enabled', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Resolution' })).toBeVisible()

  await expect(page.getByRole('button', { name: 'Unlock display config' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lock display config' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resolution' })).toBeEnabled()
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeEnabled()
})
