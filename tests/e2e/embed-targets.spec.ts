import { expect, test, type Page } from '@playwright/test'

/**
 * Targets seam (issue #106, ADR-018) against the real library build on the demo
 * host page: the host pushes three displays, the designer renders the picker
 * inside its own display-config area, and picking one drives the canvas through
 * the same capabilities mapping the `capabilities` channel uses. Vitest covers
 * the state model; this proves the flow through the built artifact — including
 * that a picked display reaches the render surface, not just the form controls.
 *
 * Served by the second Playwright webServer (python3 http.server on dist-lib,
 * port PW_EMBED_PORT — see playwright.config.ts).
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

const picker = (page: Page) => page.getByRole('combobox', { name: 'Display' })

/** What the picker currently reads as — the display the design is pinned to. */
const selectedDisplay = (page: Page) =>
  picker(page).evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? '')

/** The preview paper's pixel dimensions: proof a pick reached the render surface. */
const paperSize = (page: Page) =>
  page
    .locator('[data-canvas-paper]')
    .first()
    .evaluate((paper) => {
      const { width, height } = (paper as HTMLElement).style
      return `${parseFloat(width)}×${parseFloat(height)}`
    })

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('picking a display resizes the canvas, locks the config and tells the host', async ({
  page,
}) => {
  // The demo mounts with a bare 296×128 capabilities push: a real but unnamed
  // display, so the picker starts on the anonymous host display.
  await expect.poll(() => selectedDisplay(page)).toBe('Host display')
  await expect(page.getByTestId('target-log')).toHaveText('(nothing selected yet)')
  expect(await paperSize(page)).toBe('296×128')

  await picker(page).selectOption({ label: 'Office display (400×300 BW)' })

  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/400\s*×\s*300/)
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toHaveValue('bw')
  // Selecting locks onto the display, using the issue #70 lock UX unchanged.
  await expect(page.getByRole('button', { name: 'Unlock display config' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeDisabled()
  // The opaque id round-trips to the host…
  await expect(page.getByTestId('target-log')).toHaveText('Selected display: display.office')
  // …and reached the render surface, not just the form controls.
  await expect.poll(() => paperSize(page)).toBe('400×300')

  // The same id accompanies a host action.
  await page.getByRole('button', { name: 'Send to display' }).click()
  await expect(page.getByTestId('action-log')).toContainText('display.office')
})

test('removing the selected display keeps its config and marks the selection stale', async ({
  page,
}) => {
  await picker(page).selectOption({ label: 'Office display (400×300 BW)' })
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/400\s*×\s*300/)

  await page.getByRole('button', { name: 'Remove selected display' }).click()

  // Never silently switched or unlocked: same display config, still locked,
  // with the selection visibly marked unavailable.
  await expect
    .poll(() => selectedDisplay(page))
    .toBe('Office display (400×300 BW) (unavailable)')
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/400\s*×\s*300/)
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toHaveValue('bw')
  await expect(page.getByRole('button', { name: 'Unlock display config' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Display no longer available' })).toBeVisible()
  expect(await paperSize(page)).toBe('400×300')

  // The remaining displays are still one pick away.
  await picker(page).selectOption({ label: 'Kitchen tag (296×128 BWR)' })
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
  await expect(page.getByRole('status', { name: 'Display no longer available' })).toHaveCount(0)
})

test('a display added after mount shows up in the picker without a reload', async ({ page }) => {
  // Three pushed targets, plus the anonymous host display and Virtual display.
  await expect(picker(page).getByRole('option')).toHaveCount(5)

  await page.getByRole('button', { name: 'Add a display' }).click()

  await expect(picker(page).getByRole('option')).toHaveCount(6)
  await picker(page).selectOption({ label: 'Garage tag (152×152 BW)' })
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/152\s*×\s*152/)
})

test('the virtual display entry unlocks the display config', async ({ page }) => {
  await picker(page).selectOption({ label: 'Office display (400×300 BW)' })
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeDisabled()

  await picker(page).selectOption({ label: 'Virtual display' })

  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Lock display config' })).toBeVisible()
  await expect(page.getByTestId('target-log')).toHaveText('Virtual display — no target selected')

  // Re-locking returns to the remembered selection.
  await page.getByRole('button', { name: 'Lock display config' }).click()
  await expect.poll(() => selectedDisplay(page)).toBe('Office display (400×300 BW)')
  await expect(page.getByTestId('target-log')).toHaveText('Selected display: display.office')
})

test('standalone app shows no display picker', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Resolution' })).toBeVisible()

  await expect(page.getByRole('combobox', { name: 'Display' })).toHaveCount(0)
})

test('a very long host label never widens the sidebar', async ({ page }) => {
  // Host labels are host text: arbitrarily long, and nothing in the designer
  // gets to reflow because of one (the PR #85 horizontal-scrollbar class of
  // bug — a too-wide box inside an `overflow-hidden` panel is content the user
  // simply cannot reach). Native `<select>` truncation of the option text is
  // fine; a widened panel is not.
  await page.evaluate(() => {
    ;(
      window as unknown as {
        designerHandle: { setTargets: (targets: unknown) => void }
      }
    ).designerHandle.setTargets([
      {
        id: 'display.verbose',
        label: `Kitchen tag on the second shelf next to the coffee machine ${'and more '.repeat(30)}`,
        capabilities: { render_width: 296, render_height: 128 },
      },
    ])
  })

  await expect(picker(page).getByRole('option')).toHaveCount(3)

  const sidebar = page.locator('aside').first()
  const metrics = await sidebar.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(
    metrics.scrollWidth,
    `sidebar must not widen for a host label (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth)

  // The picker itself stays inside the panel it lives in.
  const pickerWidth = await picker(page).evaluate((el) => el.getBoundingClientRect().width)
  expect(pickerWidth).toBeLessThanOrEqual(metrics.clientWidth)
})
