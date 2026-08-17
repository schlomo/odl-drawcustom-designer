import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/**
 * Targets seam (issue #106, ADR-018) against the real library build on the demo
 * host page — the designer's one display channel (issue #121). The demo mounts
 * as a single-display host (adopted and locked with no pick), then pushes its
 * full inventory on demand; the designer renders the picker inside its own
 * display-config area, and picking a display drives the canvas. Vitest covers
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

/** The host grows from one display to its full inventory (demo/host.js). */
const pushDisplayList = async (page: Page) => {
  await page.getByRole('button', { name: 'Push display list' }).click()
  await expect(picker(page).getByRole('option')).toHaveCount(4)
}

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('the only pushed display is adopted and locked without a pick (issue #121)', async ({
  page,
}) => {
  // A one-element `targets` list is how a single-display host says "this is the
  // display" — there is no `capabilities` channel to seed one with any more, and
  // no anonymous "Host display" entry to fall back to.
  await expect.poll(() => selectedDisplay(page)).toBe('Kitchen tag (296×128 BWR)')
  await expect(page.getByTestId('target-log')).toHaveText('Selected display: display.kitchen')
  expect(await paperSize(page)).toBe('296×128')
  await expect(page.getByRole('button', { name: 'Unlock display config' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeDisabled()

  await expect(picker(page).getByRole('option')).toHaveCount(2)
  const labels = await picker(page).evaluate((select) =>
    Array.from((select as HTMLSelectElement).options, (option) => option.textContent),
  )
  expect(labels).toEqual(['Kitchen tag (296×128 BWR)', 'Virtual display'])
})

test('several displays pushed at mount are a choice, not an adoption (issue #121)', async ({
  page,
}) => {
  // The other half of the auto-adopt rule, on the *first paint* — the state the
  // mount option and a later push must agree on: a list the user can choose
  // between renders the picker unselected and moves nothing. `?displays=all`
  // makes the demo page a multi-display host (demo/host.js).
  await page.goto(`${embedUrl()}?displays=all`)
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)

  await expect(picker(page).getByRole('option')).toHaveCount(4)
  // Nothing pinned: the picker reads "Virtual display", the config is unlocked
  // and editable, and the host was told nothing.
  await expect.poll(() => selectedDisplay(page)).toBe('Virtual display')
  await expect(page.getByRole('combobox', { name: 'Color mode' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Lock display config' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unlock display config' })).toHaveCount(0)
  await expect(page.getByTestId('target-log')).toHaveText('')

  // …and one pick still does everything it does anywhere else.
  await picker(page).selectOption({ label: 'Office display (400×300 BW)' })
  await expect.poll(() => paperSize(page)).toBe('400×300')
  await expect(page.getByTestId('target-log')).toHaveText('Selected display: display.office')
})

test('picking a display resizes the canvas, locks the config and tells the host', async ({
  page,
}) => {
  await pushDisplayList(page)

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
  await pushDisplayList(page)
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
  // Three pushed displays plus the Virtual display entry.
  await pushDisplayList(page)

  await page.getByRole('button', { name: 'Add a display' }).click()

  await expect(picker(page).getByRole('option')).toHaveCount(5)
  await picker(page).selectOption({ label: 'Garage tag (152×152 BW)' })
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/152\s*×\s*152/)
})

test('the virtual display entry unlocks the display config', async ({ page }) => {
  await pushDisplayList(page)
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
  // A relabel of the display already adopted (`display.kitchen`), so this is
  // purely the layout question: same id, same capabilities, absurd label.
  // Pushing a *different* id would re-pin the design to another display
  // (issue #121 mirroring) and make this a test of two things at once.
  await page.evaluate(() => {
    ;(
      window as unknown as {
        designerHandle: { setTargets: (targets: unknown) => void }
      }
    ).designerHandle.setTargets([
      {
        id: 'display.kitchen',
        label: `Kitchen tag on the second shelf next to the coffee machine ${'and more '.repeat(30)}`,
        capabilities: {
          pixel_width: 296,
          pixel_height: 128,
          rotation_degrees: 0,
          render_width: 296,
          render_height: 128,
          color_scheme: 0x01,
          accent_color: 'red',
          available_colors: ['black', 'white', 'red'],
          color_map: { black: '#000000', white: '#ffffff', red: '#c53929' },
          palette_measured: true,
        },
      },
    ])
  })

  await expect(picker(page).getByRole('option')).toHaveCount(2)
  // Still the same display, now under its long name.
  await expect.poll(() => selectedDisplay(page)).toContain('Kitchen tag on the second shelf')
  await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)

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

test('picking a portrait display gives an upright portrait editing surface (issue #139)', async ({
  page,
}) => {
  // The Hallway display (demo target) declares a 480×800 drawing surface at
  // rotation_degrees: 90 — a landscape panel mounted portrait. The designer
  // must present that logical surface **upright**, the way upstream
  // `imagegen` draws it: portrait paper, horizontal text. It used to CSS-turn
  // the paper into a landscape stage with the design on its side (issue #139).
  await pushDisplayList(page)
  await picker(page).selectOption({ label: 'Hallway 7.5" (800×480 BWRY, portrait)' })

  // The logical drawing surface is portrait: 800→height, 480→width.
  await expect.poll(() => paperSize(page)).toBe('480×800')

  // …and so is what the user actually sees. The paper's *painted box* — its
  // rect after every transform — is portrait, so nothing turned it.
  await expect
    .poll(async () => {
      const box = await page.locator('[data-canvas-paper]').first().boundingBox()
      return box ? Math.round((box.width / box.height) * 100) / 100 : null
    })
    .toBe(Math.round((480 / 800) * 100) / 100)

  // Text is painted into the paper's own layers in logical coordinates, so the
  // paper's screen transform *is* the text's orientation: no rotation term
  // (matrix b and c are zero) means the design reads horizontally.
  const [b, c] = await page.locator('[data-canvas-paper]').first().evaluate((paper) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(paper as HTMLElement).transform)
    return [matrix.b, matrix.c]
  })
  expect([b, c], 'paper transform carries no rotation').toEqual([0, 0])

  // Rotation is seeded: the 90° button is the pressed one (the accent fill is
  // only a colour — `aria-pressed` is the state), and the orientation buttons
  // remain editable (not disabled by the lock).
  await expect(page.getByRole('button', { name: '90°' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '0°', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('the exported PNG is the upright logical canvas (issue #139)', async ({ page }) => {
  // Export is the design as drawn — the logical bitmap HA/`imagegen` produces
  // *before* its own final `rotate`. The designer used to rotate the raster
  // itself (and clockwise, 180° off Pillow's counter-clockwise), so a portrait
  // 480×800 canvas came out as an 800×480 file.
  await pushDisplayList(page)
  await picker(page).selectOption({ label: 'Hallway 7.5" (800×480 BWRY, portrait)' })
  await expect.poll(() => paperSize(page)).toBe('480×800')

  const downloadPromise = page.waitForEvent('download')
  await page.locator('[data-export-action="download-png"]:visible').first().click()
  const download = await downloadPromise
  const file = await download.path()
  expect(file, 'download produced a file').not.toBeNull()

  // PNG IHDR: width at byte offset 16, height at 20, both big-endian uint32.
  const bytes = await readFile(file!)
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([480, 800])
})
