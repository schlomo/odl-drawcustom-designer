import { expect, test, type Page } from '@playwright/test'

/**
 * The page header used to set the document's horizontal floor.
 *
 * Its right-hand action row (`Clear all` / `Load Demo` / host actions / `Copy
 * share link` / theme) was the one `shrink-0` toolbar in the app never wired
 * into ADR-016's measured label collapse, so it stayed at full width forever
 * while the meta row beside it absorbed the whole squeeze by ellipsing itself
 * into stubs (`Client-…`, `feat/si…`). Two things were wrong and both are
 * asserted here against real Chromium layout (jsdom does none):
 *
 * 1. **Overflow** — the header's own content box overflowed, and in an
 *    embedded mount that overflow escaped the shadow root and put a
 *    horizontal scrollbar on the HOST page (AGENTS.md: the designer must
 *    never scroll its host).
 * 2. **Shrink priority** — the buttons must give up their text labels BEFORE
 *    any header metadata is truncated, and metadata that no longer fits is
 *    dropped whole rather than shown as a meaningless stub (maintainer ruling
 *    2026-08-31).
 *
 * Widths span the reported 900–1400px band plus much narrower ones. Below
 * ~780px the *workspace* (the add-element bar in a squeezed centre column)
 * becomes the widest thing on the page — that is a different subtree and
 * outside this fix, so the narrow cases assert the header's behaviour rather
 * than the document's total width.
 */

const HEIGHT = 900

interface HeaderMetrics {
  headerScrollWidth: number
  headerClientWidth: number
  documentScrollWidth: number
  documentClientWidth: number
  /** Visible text on each action button — empty string means icon-only. */
  actionLabels: string[]
  /** Meta segments still in the DOM, in render order (tagged builds only). */
  metaSegments: string[]
  /** Every live child of the meta row, separators included. */
  metaChildCount: number
  /** Meta segments whose text is clipped/ellipsed rather than shown in full. */
  truncatedSegments: string[]
  /** Meta segments rendered but made invisible — always a bug (PR #85). */
  invisibleSegments: string[]
}

async function readHeader(page: Page, inShadowRoot: boolean): Promise<HeaderMetrics> {
  return page.evaluate((shadow: boolean) => {
    const findInShadow = (root: Document | ShadowRoot): HTMLElement | null => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const header = el.shadowRoot.querySelector('header')
          if (header) {
            return header as HTMLElement
          }
          const nested = findInShadow(el.shadowRoot)
          if (nested) {
            return nested
          }
        }
      }
      return null
    }

    const header = shadow ? findInShadow(document) : document.querySelector('header')
    if (header == null) {
      throw new Error('designer header not found')
    }

    // The header also holds an off-screen measurement probe whose copy always
    // renders full labels and every metadata segment; it is `aria-hidden`, so
    // that is what separates the live chrome from the probe here — and it works
    // on the pre-fix header too, which has no probe and no new test ids.
    const isLive = (el: Element) => el.closest('[aria-hidden="true"]') == null
    const buttons = [...header.querySelectorAll('[role="group"] button')].filter(isLive)
    const metaRow = header.querySelector('[data-testid="header-meta-row"]')
    const children = metaRow == null ? [] : [...metaRow.children].filter(isLive)
    const idOf = (el: Element) => el.getAttribute('data-header-meta') ?? el.textContent?.trim() ?? '?'
    const root = document.documentElement

    return {
      headerScrollWidth: header.scrollWidth,
      headerClientWidth: header.clientWidth,
      documentScrollWidth: root.scrollWidth,
      documentClientWidth: root.clientWidth,
      actionLabels: buttons.map((b) => (b.textContent ?? '').trim()),
      metaSegments: children
        .filter((el) => el.hasAttribute('data-header-meta'))
        .map((el) => el.getAttribute('data-header-meta') ?? '?'),
      metaChildCount: children.length,
      truncatedSegments: children.filter((el) => el.scrollWidth > el.clientWidth + 1).map(idOf),
      invisibleSegments: children
        .filter((el) => getComputedStyle(el).visibility === 'hidden')
        .map(idOf),
    }
  }, inShadowRoot)
}

async function settle(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT })
  // Two frames: one for the ResizeObserver delivery, one for the re-render it
  // schedules. Deliberately not a `waitFor` poll — the collapse is supposed to
  // be settled by the frame after the resize, and polling would hide a stall.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

test.describe('page header horizontal overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: HEIGHT })
    await page.goto('/')
    await expect(page.getByTestId('header-meta-row')).toBeVisible()
  })

  for (const width of [1400, 1100, 900, 780, 700]) {
    test(`header fits its own row at ${width}px`, async ({ page }) => {
      await settle(page, width)
      const m = await readHeader(page, false)
      expect(
        m.headerScrollWidth,
        `header overflowed its box by ${m.headerScrollWidth - m.headerClientWidth}px`,
      ).toBeLessThanOrEqual(m.headerClientWidth + 1)
    })
  }

  for (const width of [1400, 1100, 900]) {
    test(`the page does not scroll horizontally at ${width}px`, async ({ page }) => {
      await settle(page, width)
      const m = await readHeader(page, false)
      expect(
        m.documentScrollWidth,
        `document overflowed by ${m.documentScrollWidth - m.documentClientWidth}px`,
      ).toBeLessThanOrEqual(m.documentClientWidth + 1)
    })
  }

  for (const width of [1400, 1100, 1000, 900, 700, 375]) {
    test(`no header metadata is truncated to a stub at ${width}px`, async ({ page }) => {
      await settle(page, width)
      const m = await readHeader(page, false)
      if (width >= 900) {
        // Guard against a vacuous pass: the row must still be showing metadata
        // at these widths, and none of it may be a stub.
        expect(m.metaChildCount).toBeGreaterThan(0)
      }
      // Metadata is dropped whole, never ellipsed into `Client-…`.
      expect(m.truncatedSegments).toEqual([])
      // And dropping means removed from the DOM, not merely invisible — a
      // hidden layout box is exactly what widens scrollers (PR #85).
      expect(m.invisibleSegments).toEqual([])
    })
  }

  test('the action buttons give up their labels before the metadata gives up anything', async ({
    page,
  }) => {
    await settle(page, 1600)
    const wide = await readHeader(page, false)
    expect(wide.actionLabels.some((label) => label.length > 0)).toBe(true)
    const allSegments = wide.metaSegments
    expect(allSegments.length).toBeGreaterThan(0)

    // The priority rule, stated so it holds for any build's label lengths:
    // metadata may only start disappearing once the buttons are ALREADY
    // icon-only. The pre-fix header had it exactly backwards — the text
    // absorbed every squeeze while the buttons never yielded.
    for (const width of [1400, 1200, 1100, 1000, 900, 800, 700, 600, 500, 375]) {
      await settle(page, width)
      const m = await readHeader(page, false)
      const labelled = m.actionLabels.filter((label) => label.length > 0)
      if (m.metaSegments.length < allSegments.length) {
        expect(labelled, `metadata dropped while buttons kept labels at ${width}px`).toEqual([])
      }
      expect(m.truncatedSegments, `stub metadata at ${width}px`).toEqual([])
    }
  })

  test('metadata is given up strictly in priority order', async ({ page }) => {
    // Least valuable first; the build identity (release tag / `PR #n`, or the
    // SHA on a build that has neither) is the last thing standing.
    const dropOrder = ['privacy', 'github', 'branch', 'sha', 'version']
    const renderOrder = ['privacy', 'github', 'version', 'branch', 'sha']

    await settle(page, 1600)
    const rendered = (await readHeader(page, false)).metaSegments
    expect(rendered.length).toBeGreaterThan(0)
    const droppable = dropOrder.filter((segment) => rendered.includes(segment))

    for (const width of [1400, 1200, 1100, 1000, 900, 800, 700, 600, 500, 375]) {
      await settle(page, width)
      const m = await readHeader(page, false)
      const survivors = droppable.slice(droppable.length - m.metaSegments.length)
      const expected = renderOrder.filter((segment) => survivors.includes(segment))
      expect(m.metaSegments, `width ${width}`).toEqual(expected)
    }
  })
})

test.describe('embedded host header', () => {
  const embedUrl = () => `http://localhost:${process.env.PW_EMBED_PORT}/`

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: HEIGHT })
    await page.goto(embedUrl())
    await expect(page.getByTestId('element-list-row').first()).toBeVisible()
  })

  for (const width of [1400, 1100, 900]) {
    test(`the designer header fits its mount at ${width}px (host actions registered)`, async ({
      page,
    }) => {
      await settle(page, width)
      const m = await readHeader(page, true)
      // The demo host registers four actions, so this header is much wider
      // than the standalone one — this is the case that put a horizontal
      // scrollbar on the HOST page inside the reported 900–1400 band.
      expect(
        m.headerScrollWidth,
        `embedded header overflowed its mount by ${m.headerScrollWidth - m.headerClientWidth}px`,
      ).toBeLessThanOrEqual(m.headerClientWidth + 1)
    })
  }
})
