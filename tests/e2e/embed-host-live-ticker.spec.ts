import { expect, test } from '@playwright/test'

/**
 * Demo host ticker (issue #119, ADR-018 forward-only ruling): the demo host
 * page pushes a self-mutating `sensor.demo_clock` state once per second via
 * `handle.setStates()` — proving the live-update push channel end to end,
 * not just seeding `states` once at mount. The demo payload's second text
 * element templates the clock alongside the existing friendly_name value
 * (`demo/host.js`), so the ticking value is on the canvas, not just pushed
 * into an unreferenced state.
 *
 * Condition-based wait (docs/testing.md): captures the row's rendered text,
 * then asserts it eventually differs — no fixed sleep, no assumption about
 * exactly which tick lands first.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

test('demo host ticker changes the canvas text at least once across a real wait', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  // The friendly_name row templates the ticking sensor.demo_clock state
  // alongside the static friendly_name value — element count stays 3.
  const clockRow = page.getByTestId('element-list-row').filter({ hasText: 'Living room' })
  await expect(clockRow).toBeVisible()

  const initialText = await clockRow.textContent()

  // expect.poll re-reads textContent() the same way the baseline was read
  // (unlike `.not.toHaveText()`, which compares against its own
  // whitespace-normalized snapshot and would spuriously "differ" from a raw
  // `textContent()` baseline even with no ticker at all). Polls until the
  // rendered value differs from the first-observed one — proof the push
  // channel is live, not a one-time seed. Default assertion timeout (5s)
  // comfortably covers several one-second ticks.
  await expect
    .poll(() => clockRow.textContent(), { message: 'ticker never changed the canvas text' })
    .not.toBe(initialText)
})
