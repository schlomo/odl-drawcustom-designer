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

/**
 * Coverage gap (Copilot review on PR #128): the test above proves the
 * ticker changes the canvas at least once, but not that a non-clock state
 * pushed mid-stream (e.g. a "cold" reading) *survives* the ticker's own
 * re-push. Before the `demoPushStates` fix (demo/host.js), the ticker's
 * `pushCombinedStates()` always re-sent its own `temperatureStates`
 * snapshot from mount, so any push made another way silently reverted on
 * the very next tick (proven directly against `embed-host-push-mid-drag.spec.ts`
 * — see that spec's push, now routed through `demoPushStates`).
 *
 * This asserts the row's cold-state values are still showing *after*
 * observing the clock advance past the push — the actual tick boundary —
 * not merely immediately after the push (which passes even on the buggy
 * code, since the push itself always lands; only the *next* tick reveals
 * whether it was clobbered).
 */
test('a non-clock state pushed via demoPushStates survives the next ticker tick', async ({
  page,
}) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await expect(
    page.getByTestId('element-list-row').filter({ hasText: 'Living room' }),
  ).toBeVisible()

  await page.evaluate(() => {
    ;(
      window as unknown as { demoPushStates: (states: unknown) => void }
    ).demoPushStates({
      'sensor.demo_temperature': {
        state: '3.2',
        attributes: { friendly_name: 'Balcony', unit_of_measurement: '°C' },
      },
    })
  })

  const balconyRow = page.getByTestId('element-list-row').filter({ hasText: 'Balcony' })
  await expect(balconyRow).toBeVisible()
  const textRightAfterPush = await balconyRow.textContent()

  // Wait for the ticker to actually advance past this push (the row's text
  // includes the ticking clock, so a change here IS the next tick landing)
  // before checking the cold values are still intact.
  await expect
    .poll(() => balconyRow.textContent(), {
      message: 'ticker never advanced past the pushed state',
    })
    .not.toBe(textRightAfterPush)

  await expect(page.getByTestId('element-list-row').filter({ hasText: '3.2 °C' })).toBeVisible()
  await expect(page.getByTestId('element-list-row').filter({ hasText: 'Balcony' })).toBeVisible()
})

/**
 * Coverage gap (Copilot review on PR #128): no test proved Destroy actually
 * stops the ticker from calling `setStates()` again — a queued tick firing
 * against an already-destroyed `MountHandle` throws (`mount.tsx`:
 * `assertMounted()`), which would surface as an uncaught page error. Manual
 * verification (browser) confirms `handle.destroy()` unmounts the designer
 * entirely — `#designer` ends up with zero children — so there is no
 * "clock text" left on screen to compare after Destroy; the observable
 * proof is instead that the unmounted state is *stable* (no element rows
 * ever reappear or change) and that no console error/pageerror fires from
 * a post-destroy push, across a wait spanning more than one tick period.
 */
test('Destroy clears the ticker before destroying the handle: no push lands afterward', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  const clockRow = page.getByTestId('element-list-row').filter({ hasText: 'Living room' })
  await expect(clockRow).toBeVisible()

  // Prove the ticker is genuinely live before Destroy, so the freeze
  // asserted below is a real stop — not "it never started ticking".
  const beforeDestroy = await clockRow.textContent()
  await expect
    .poll(() => clockRow.textContent(), { message: 'ticker never ticked before Destroy' })
    .not.toBe(beforeDestroy)

  await page.getByRole('button', { name: 'Destroy' }).click()
  await expect(page.getByTestId('element-list-row')).toHaveCount(0)

  // No further condition to poll for here — the claim under test is an
  // absence (nothing happens over the next tick period), which genuinely
  // needs elapsed wall-clock time rather than a condition to wait for.
  // 1200ms comfortably spans one 1000ms tick interval.
  await page.waitForTimeout(1200)

  await expect(page.getByTestId('element-list-row')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
