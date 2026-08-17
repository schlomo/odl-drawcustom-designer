import { expect, test, type Page } from '@playwright/test'

/**
 * Preview provider seam (issue #109, ADR-018) against the real library build on
 * the demo host page: the host renders the payload itself
 * ([`demo/preview-render.js`](../../demo/preview-render.js), a crude stand-in
 * for a server-side Pillow render) and the designer shows that image instead of
 * its own preview.
 *
 * Vitest covers the state model (request/response matching, error state,
 * inertness). What only a real browser proves is the round trip end to end: a
 * real PNG encoded host-side, decoded into the canvas area at the canvas's own
 * zoom, and a dither flip producing genuinely different pixels — not just a
 * different provider argument.
 *
 * Served by the second Playwright webServer (python3 http.server on dist-lib,
 * port PW_EMBED_PORT — see playwright.config.ts).
 */

const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

const previewToggle = (page: Page) => page.getByRole('button', { name: 'Display preview' })
const previewImage = (page: Page) => page.getByTestId('display-preview-image')

/**
 * A signature of the *pixels* the host sent: dimensions plus the summed red
 * channel. A dither change repaints the same design differently, so the sum
 * moves — proof the new render reached the screen, which a blob URL comparison
 * could not give (every response mints a fresh one).
 */
const previewSignature = (page: Page) =>
  previewImage(page).evaluate(async (image) => {
    const img = image as HTMLImageElement
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('no 2D context')
    }
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 0; index < data.length; index += 4) {
      ink += data[index]!
    }
    return `${canvas.width}x${canvas.height}:${ink}`
  })

test.beforeEach(async ({ page }) => {
  await page.goto(embedUrl())
  await expect(page.getByTestId('element-list-row')).toHaveCount(3)
})

test('shows the host render, follows the dither option, and restores editing on exit', async ({
  page,
}) => {
  // Conditional chrome: the toggle is here because this host registered a
  // provider (demo/host.js).
  await expect(previewToggle(page)).toBeVisible()
  await expect(previewImage(page)).toHaveCount(0)

  await previewToggle(page).click()

  // A host render is a round trip — the designer says so while it waits.
  await expect(page.getByTestId('display-preview-loading')).toBeVisible()
  await expect(previewImage(page)).toBeVisible()
  await expect(page.getByTestId('preview-log')).toContainText('dither=0')
  await expect(page.getByTestId('preview-log')).toContainText('display=display.kitchen')

  // The host renders at its display's own size (296x128 kitchen tag).
  const flat = await previewSignature(page)
  expect(flat).toContain('296x128')

  // The dither control stays live in preview mode and re-requests: same design,
  // different quantization, different pixels.
  await page.getByRole('button', { name: 'Dither flat' }).click()
  await expect(page.getByTestId('preview-log')).toContainText('dither=2')
  await expect.poll(() => previewSignature(page)).not.toBe(flat)

  // Copy/Download PNG stay live against the host render.
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled()
  // Editing does not.
  await expect(page.getByRole('button', { name: 'Add text' })).toBeDisabled()

  await previewToggle(page).click()

  await expect(previewImage(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Add text' }).click()
  await expect(page.getByTestId('element-list-row')).toHaveCount(4)
})

test('states a failed host render instead of falling back to the designer preview', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Simulate preview failure' }).click()

  await previewToggle(page).click()

  const error = page.getByTestId('display-preview-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('the display did not answer the render request')
  // A clear error, not a wrong image.
  await expect(previewImage(page)).toHaveCount(0)
})
