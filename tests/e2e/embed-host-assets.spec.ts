import { expect, test } from '@playwright/test'

/**
 * Host-resolved assets (issue #138 layer 1) against the real demo host page:
 * a payload references a font and an image by the bare names the host's own
 * directories use, plus one name nobody can supply. The designer must ask the
 * host by name, paint what comes back, and show its explicit render-error state
 * for what does not — none of which Vitest/jsdom can prove (no real font
 * parsing against a fetched URL, no real image decode, no canvas pixels).
 *
 * Served by the embed webServer (python3 http.server on dist-lib, port
 * PW_EMBED_PORT — see playwright.config.ts), so the font and image travel over
 * HTTP from demo/assets/ exactly as a host would serve them.
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

const CANVAS = { width: 296, height: 128 }

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Push host-asset payload' }).click()
})

test('the host is asked for every unresolvable name, and answers with a URL, a blob, or null', async ({
  page,
}) => {
  const log = page.getByTestId('asset-log')

  await expect(log).toContainText(
    "resolveAsset('font', 'demo-host-font.ttf') -> 'assets/demo-host-font.ttf' (URL answer)",
  )
  await expect(log).toContainText(
    "resolveAsset('image', 'demo-host-logo.png') -> Blob from 'assets/demo-host-logo.png'",
  )
  await expect(log).toContainText(
    "resolveAsset('font', 'no-such-host-font.ttf') -> null (this host has no such font)",
  )

  // Bundled and locally resolvable assets never reach the host.
  await expect(log).not.toContainText('ppb.ttf')
})

test('a host-supplied image paints on the canvas', async ({ page }) => {
  // The demo host's logo is deliberately mostly ink (a solid black square with
  // a white plus), drawn at (6, 40) 56×56. So the ink fraction inside that
  // rectangle separates "the host's bytes decoded and painted" from every
  // other outcome: the render-error placeholder for an image nobody supplied is
  // white with an outline and a label, nowhere near this dense. Verified red by
  // making the demo host decline the image — the probe drops far below the
  // threshold and the "Image not available" banner appears.
  const inkFractionInLogoRect = async () =>
    await page.locator('[data-canvas-paper] canvas').evaluateAll(
      (elements, { canvas, rect }) => {
        // Summed over every canvas layer the paper stacks: which layer an
        // element lands on is a renderer detail, ink on the paper is not.
        let dark = 0
        let sampled = 0
        for (const element of elements) {
          const target = element as HTMLCanvasElement
          const context = target.getContext('2d')
          if (!context) {
            throw new Error('no 2d context on a preview canvas layer')
          }
          const scaleX = target.width / canvas.width
          const scaleY = target.height / canvas.height
          const { data } = context.getImageData(
            Math.round(rect.x * scaleX),
            Math.round(rect.y * scaleY),
            Math.round(rect.width * scaleX),
            Math.round(rect.height * scaleY),
          )
          sampled = data.length / 4
          for (let at = 0; at < data.length; at += 4) {
            // Alpha matters: a layer is transparent where nothing is painted,
            // and transparent pixels read as rgb(0,0,0) — counting them as ink
            // would make an empty rectangle look 100% covered.
            const painted = data[at + 3]! > 128
            if (painted && data[at]! < 96 && data[at + 1]! < 96 && data[at + 2]! < 96) {
              dark += 1
            }
          }
        }
        return sampled === 0 ? 0 : dark / sampled
      },
      { canvas: CANVAS, rect: { x: 6, y: 40, width: 56, height: 56 } },
    )

  await expect.poll(inkFractionInLogoRect, { timeout: 10_000 }).toBeGreaterThan(0.5)
  await expect(page.getByText('Image not available')).toHaveCount(0)
  await expect(page.getByText('Image failed to load')).toHaveCount(0)
})

test('only the name nobody can supply gets the render-error state, and it says so', async ({
  page,
}) => {
  const banner = page.getByText('Font not available')
  await expect(banner).toHaveCount(1)

  const status = page.locator('[role="status"]').filter({ hasText: 'Font not available' })
  await expect(status).toContainText('no-such-host-font.ttf')
  await expect(status).toContainText('could not be supplied by the host')
  await expect(status).not.toContainText('demo-host-font.ttf')

  // The host-supplied font is not an error of any kind.
  await expect(page.getByText('Font failed to load')).toHaveCount(0)
})
