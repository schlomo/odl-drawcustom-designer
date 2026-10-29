import { expect, test } from '@playwright/test'

/**
 * Host-supplied Load Demo (`MountOptions.demo`) through the real library
 * bundle on the demo host page: the page ships a demo written against the
 * states it actually pushes, so the designer's Load Demo loads *that* payload
 * and seeds its variables — every referenced state resolves (nothing reads
 * "not supplied"), the host display stays, and a Send right after reports the
 * demo's variables. Vitest proves the option against `mount()`; this proves
 * the reference page expresses it (ADR-018's litmus test). `?demo=showcase`
 * keeps the bundled showcase for the specs that need its breadth.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

test('Load Demo loads the host demo, resolves against the host states and seeds its variables', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Load Demo' }).click()

  // The host demo's four elements, not the showcase's many.
  await expect(page.getByTestId('element-list-row')).toHaveCount(4)
  // A host demo carries no display config: the adopted kitchen tag stays.
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)

  await page.getByRole('button', { name: 'States', exact: true }).click()
  const panel = page.getByTestId('referenced-states-panel')
  await expect(panel).toBeVisible()
  // Written against the host's own catalog: the door the mount payload never
  // read resolves with the host's name and value, and nothing is missing.
  const door = page.getByTestId('referenced-state-row-binary_sensor.demo_door')
  await expect(door).toContainText('Front door')
  await expect(door).toContainText('off')
  await expect(panel).not.toContainText('not supplied')
  await expect(page.getByTestId('referenced-state-row-sensor.temperature')).toHaveCount(0)
  // The demo's variables seeded the Variables editor next to the panel.
  await expect(page.getByLabel('Value for variable accent')).toHaveValue('red')
  await expect(page.getByLabel('Value for variable title')).toHaveValue('Host demo')

  await page.getByRole('button', { name: 'Send to display' }).click()
  const log = page.getByTestId('action-log')
  await expect(log).toContainText('Sent')
  await expect(log).toContainText("states('binary_sensor.demo_door')")
  await expect(log).toContainText('"accent":"red"')
})
