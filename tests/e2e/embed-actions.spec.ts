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

/**
 * `--shell-warning-*` in light theme (src/index.css) — the caution palette.
 * Border is amber-700 (#b45309), not amber-300 — issue #132 raised it from
 * ~1.4:1 against the toolbar background to ~4.8:1, computed, so a caution
 * button's border actually reads as a border.
 */
const CAUTION_BG = 'rgb(255, 251, 235)'
const CAUTION_BORDER = 'rgb(180, 83, 9)'

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
  // Each action is its own channel: clicking Send never runs the host's Save.
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

// Maintainer ruling (2026-08-16, screenshot evidence): a disabled action's
// tooltip opened *above* the top toolbar row — outside the designer's own
// boundary. An embedded host (HA panel iframe/shadow container) may give the
// mount zero space above it, so the bubble is clipped or paints over host
// chrome. Floating UI must always stay within the designer's own frame;
// top-row chrome must never assume space exists outside it. Bounding boxes
// (not `elementFromPoint`, which the tooltip's `pointer-events-none` always
// resolves through to the control behind it) prove the bubble renders fully
// inside the mount instead — pattern from embed-display-lock.spec.ts.
test('a disabled host-action tooltip opens below, inside the designer boundary', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Simulate display offline' }).click()

  const send = page.getByRole('button', { name: 'Send to display' })
  await expect(send).toBeDisabled()

  await send.hover({ force: true })
  const tooltip = page
    .getByRole('tooltip')
    .filter({ hasText: 'Display offline — reconnect to send' })
  await expect(tooltip).toBeVisible()

  const geometry = await page.evaluate(() => {
    function findShadowRoot(node: Element): ShadowRoot | null {
      if (node.shadowRoot) return node.shadowRoot
      for (const child of Array.from(node.children)) {
        const found = findShadowRoot(child)
        if (found) return found
      }
      return null
    }
    const shadowRoot = findShadowRoot(document.body)
      // The SHOWN tooltip: every icon-only control now carries a `role="tooltip"`
      // span (display:none until hovered), so an unqualified query would pick
      // whichever comes first in the DOM — since the page header collapses to
      // icon-only buttons (ADR-016), that is a header bubble, not the hovered one.
    const tooltipEl = shadowRoot?.querySelector('[role="tooltip"][aria-hidden="false"]')
    const designerRoot = shadowRoot?.querySelector('[data-odl-designer-root]')
    if (!tooltipEl || !designerRoot) return null
    const tooltipBox = tooltipEl.getBoundingClientRect()
    const rootBox = designerRoot.getBoundingClientRect()
    return {
      opensBelowTrigger: tooltipBox.top >= rootBox.top,
      fullyWithinDesignerRoot:
        tooltipBox.top >= rootBox.top &&
        tooltipBox.bottom <= rootBox.bottom &&
        tooltipBox.left >= rootBox.left &&
        tooltipBox.right <= rootBox.right,
    }
  })

  expect(geometry?.fullyWithinDesignerRoot).toBe(true)
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
