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
    // Lock scope is dimensions + color mode/palette only (maintainer ruling
    // 2026-08-16): rotation is a user choice and stays editable while locked.
    await expect(page.getByRole('button', { name: '90°' })).toBeEnabled()
  })

  test('rotating while locked keeps the lock and does not clear the selection', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '90°' }).click()

    await expect(page.getByRole('button', { name: 'Unlock display config' })).toBeVisible()
    await expect(page.getByRole('button', { name: '90°' })).toHaveAttribute('aria-pressed', 'true')
    // The orientation choice re-orients the logical drawing surface itself
    // (issue #139): the same panel, held portrait. The resolution control names
    // that panel by its two dimensions and is orientation-insensitive (F3), so
    // it keeps reading as the 296×128 pick rather than flipping to "Custom" —
    // and the lock is untouched, so it stays disabled.
    await expect(page.getByRole('button', { name: 'Resolution' })).toContainText(/296\s*×\s*128/)
    await expect(page.getByRole('button', { name: 'Resolution' })).not.toContainText(/Custom/i)
    await expect(page.getByRole('button', { name: 'Resolution' })).toBeDisabled()
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

  // Maintainer review (2026-07-28): the lock button sits flush at the top of
  // the sidebar's `overflow-hidden` `<aside>` — an upward-popping tooltip has
  // no room and gets clipped by the aside's own top edge, reading as a dark
  // pill half-hidden behind the app header above "Display config". Bounding
  // boxes (not `elementFromPoint`, which the tooltip's `pointer-events-none`
  // always resolves through to the control behind it) prove the bubble
  // renders fully inside its clipping ancestor and the viewport instead.
  test('lock button tooltip is not clipped by the sidebar top edge', async ({ page }) => {
    const lockButton = page.getByRole('button', { name: 'Unlock display config' })
    await lockButton.hover()

    // The tooltip fades in after TOOLBAR_TOOLTIP_SHOW_DELAY_MS; getByRole
    // excludes aria-hidden/display:none elements from the a11y tree, so
    // waiting on it (rather than reading geometry immediately) settles the
    // hover state before the bounding-box assertions below.
    await expect(page.getByRole('tooltip', { name: 'Unlock display config' })).toBeVisible()

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
      const tooltip = shadowRoot?.querySelector('[role="tooltip"]')
      const aside = tooltip?.closest('aside')
      if (!tooltip || !aside) return null
      const tooltipBox = tooltip.getBoundingClientRect()
      const asideBox = aside.getBoundingClientRect()
      return {
        ariaHidden: tooltip.getAttribute('aria-hidden'),
        display: getComputedStyle(tooltip).display,
        fullyWithinAside:
          tooltipBox.top >= asideBox.top &&
          tooltipBox.bottom <= asideBox.bottom &&
          tooltipBox.left >= asideBox.left &&
          tooltipBox.right <= asideBox.right,
        fullyWithinViewport:
          tooltipBox.top >= 0 &&
          tooltipBox.left >= 0 &&
          tooltipBox.bottom <= window.innerHeight &&
          tooltipBox.right <= window.innerWidth,
      }
    })

    expect(geometry?.display).not.toBe('none')
    expect(geometry?.ariaHidden).toBe('false')
    expect(geometry?.fullyWithinAside).toBe(true)
    expect(geometry?.fullyWithinViewport).toBe(true)
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
