import { expect, test } from '@playwright/test'

/**
 * Referenced-states panel and Simulator policy (issue #107, ADR-018 state
 * catalog), against the real demo host page: the Simulator tab is *replaced* by
 * a read-only States panel when a host feeds states, the panel lists only what
 * the payload references (with the host's friendly names), it follows the demo
 * ticker live, and Load Demo in host-fed mode loads the payload only — so the
 * demo's own states show as "not supplied".
 *
 * jsdom cannot prove the replacement end to end: it takes a real `mount()` with
 * a real `states` push, the real library build, and the real 1s ticker.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

test('the States panel replaces the Simulator and names the states the design reads', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await expect(page.getByRole('button', { name: 'Simulator', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'States', exact: true }).click()

  await expect(page.getByTestId('referenced-states-panel')).toBeVisible()
  // Friendly names, not raw keys, for the two states the demo payload templates.
  await expect(page.getByText('Living-room temperature')).toBeVisible()
  await expect(page.getByText('Demo clock')).toBeVisible()
  // The host also pushes a state this payload never reads — the panel is the
  // referenced set, not the catalog (which lives in YAML autocomplete).
  await expect(page.getByTestId('referenced-state-row-binary_sensor.demo_door')).toHaveCount(0)
  await expect(page.getByText('Front door')).toHaveCount(0)
})

test('the panel follows the host ticker live', async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'States', exact: true }).click()

  const clockRow = page.getByTestId('referenced-state-row-sensor.demo_clock')
  await expect(clockRow).toBeVisible()

  const initialText = await clockRow.textContent()
  // Same condition-based wait as the canvas ticker spec (docs/testing.md): poll
  // the row's own text until the push channel changes it — no fixed sleep, no
  // assumption about which tick lands first.
  await expect
    .poll(() => clockRow.textContent(), { message: 'the panel never followed a push' })
    .not.toBe(initialText)
})

test('a state pushed by the host lands in the panel, name and value together', async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'States', exact: true }).click()

  await page.getByRole('button', { name: 'Push cold states' }).click()

  const row = page.getByTestId('referenced-state-row-sensor.demo_temperature')
  await expect(row).toContainText('Balcony temperature')
  await expect(row).toContainText('3.2')
})

test('Load Demo under host-fed states loads the payload only: unreferenced-by-the-host states read "not supplied"', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Load Demo' }).click()

  await page.getByRole('button', { name: 'States', exact: true }).click()
  const panel = page.getByTestId('referenced-states-panel')
  await expect(panel).toBeVisible()

  // The showcase payload reads states this host does not supply. They must read
  // as missing — not as demo mock values the next host push would wipe.
  const missingRow = page.getByTestId('referenced-state-row-sensor.temperature')
  await expect(missingRow).toContainText('not supplied')
  await expect(panel).not.toContainText('21.5')
  // And no Simulator editing UI appeared with the demo payload.
  await expect(page.getByRole('button', { name: 'Simulator', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('New entity id')).toHaveCount(0)
})

test('standalone keeps the State Simulator and shows no States panel', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'States', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Simulator', exact: true }).click()

  await expect(page.getByLabel('New entity id')).toBeVisible()
  await expect(page.getByTestId('referenced-states-panel')).toHaveCount(0)
})
