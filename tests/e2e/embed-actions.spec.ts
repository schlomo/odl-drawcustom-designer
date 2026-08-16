import { expect, test } from '@playwright/test'
import { deleteFirstColonInYamlLine } from './fixtures/yaml-editor'

/**
 * Host-registered actions (issue #108, ADR-018) against the real library
 * build on the demo host page: severity chrome as actually painted (jsdom has
 * no compiled Tailwind, so this is the only place the orange is real), the
 * click → host callback round-trip carrying the live payload, and a
 * `setActions()` re-push disabling a button with a hover-readable reason.
 *
 * Served by the second Playwright webServer (python3 http.server on
 * dist-lib, port PW_EMBED_PORT — see playwright.config.ts).
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

/** `--shell-warning-*` in light theme (src/index.css) — the caution palette. */
const CAUTION_BG = 'rgb(255, 251, 235)'
const CAUTION_BORDER = 'rgb(252, 211, 77)'

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('a caution action is painted in the warning palette, a normal one is not', async ({
  page,
}) => {
  const send = page.getByRole('button', { name: 'Send to display' })
  const validate = page.getByRole('button', { name: 'Validate' })
  await expect(send).toBeVisible()
  await expect(validate).toBeVisible()

  const paint = (name: string) =>
    page.getByRole('button', { name }).evaluate((button) => {
      const style = getComputedStyle(button)
      return { background: style.backgroundColor, border: style.borderTopColor }
    })

  expect(await paint('Send to display')).toEqual({
    background: CAUTION_BG,
    border: CAUTION_BORDER,
  })
  const normal = await paint('Validate')
  expect(normal.background).not.toBe(CAUTION_BG)
  expect(normal.border).not.toBe(CAUTION_BORDER)
})

test('clicking an action hands the host the live payload', async ({ page }) => {
  await page.getByTestId('element-list-row').filter({ hasText: '21.5 °C' }).click()
  await expect(page.getByTestId('property-panel-selection')).toContainText('text')

  const xInput = page.getByTestId('property-input-x')
  await xInput.fill('42')
  await xInput.blur()

  await page.getByRole('button', { name: 'Send to display' }).click()

  const log = page.getByTestId('action-log')
  await expect(log).toContainText('Sent')
  await expect(log).toContainText("{{ states('sensor.demo_temperature') }} °C")
  await expect(log).toContainText('x: 42')
  // The host's own Save channel stays untouched by an action click.
  await expect(page.getByTestId('saved-payload')).toHaveText('(nothing saved yet)')
})

test('a re-push disables an action and states the reason on hover', async ({ page }) => {
  await page.getByRole('button', { name: 'Simulate display offline' }).click()

  const send = page.getByRole('button', { name: 'Send to display' })
  await expect(send).toBeDisabled()

  await send.hover({ force: true })
  await expect(page.getByRole('tooltip').filter({ hasText: 'Display offline' })).toBeVisible()

  // Reconnecting re-enables it — the same list, pushed again.
  await page.getByRole('button', { name: 'Simulate display online' }).click()
  await expect(send).toBeEnabled()
})

test('a disabled caution action keeps its own surface while hovered', async ({ page }) => {
  // Hovering is *how* the disabled reason gets read, so a hover that repainted
  // the button in the neutral surface would change what it looks like at the
  // exact moment the user is inspecting it.
  //
  // Two mechanisms hold this today: `disabledButton` resolves the hover
  // background to the button's own `--shell-button-surface`, *and*
  // ToolbarTooltip gives disabled buttons `pointer-events: none` (so `:hover`
  // does not match them at all — measured, not assumed). This locks the
  // observable outcome so removing either one is caught.
  await page.getByRole('button', { name: 'Simulate display offline' }).click()

  const send = page.getByRole('button', { name: 'Send to display' })
  await expect(send).toBeDisabled()

  const background = () => send.evaluate((button) => getComputedStyle(button).backgroundColor)
  expect(await background()).toBe(CAUTION_BG)

  await send.hover({ force: true })
  await expect(page.getByRole('tooltip').filter({ hasText: 'Display offline' })).toBeVisible()
  expect(await background()).toBe(CAUTION_BG)
})

test('an action that does not need the payload survives a blocked YAML document', async ({
  page,
}) => {
  // `needsPayload: false` (the demo's host-side settings button) opts out of
  // the rule that a broken document disables everything carrying the payload.
  await deleteFirstColonInYamlLine(page, 'type: rectangle')
  await expect(page.getByTestId('canvas-blocked-overlay')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Send to display' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Display settings' })).toBeEnabled()
})
