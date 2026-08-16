import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Issue #132 follow-up (Copilot-adjudicated finding #3 on PR #135): the
 * `tests/ui/styles/shell.test.ts` suite only greps literal Tailwind
 * arbitrary-value strings in `shell.ts` — that catches a class losing a
 * state or pointing at the wrong variable *name*, but Vitest/jsdom never
 * runs Tailwind, so a `--shell-button-*` token retuned to the wrong *value*
 * in `index.css` (e.g. a contrast regression) still passes every one of
 * those assertions. This spec is the real coverage: it runs against the
 * actual built standalone bundle (`vite preview`, same server as the other
 * three-panel-smoke specs) and reads `getComputedStyle` for a genuine
 * neutral button, in both themes, through real pointer/keyboard events.
 *
 * Button under test: one of the sidebar rotation-degree buttons
 * (`src/ui/components/Sidebar.tsx`) — plain `shell.button` chrome with no
 * side effects worth avoiding, and the exact button that regressed when a
 * second `hover:bg-[var(--shell-hover)]` utility was stacked on top of
 * `shell.button`'s own `hover:bg-[var(--shell-button-hover)]` (the later
 * `--shell-hover` rule won in the built CSS, so that one button kept the old
 * dim hover while every sibling got the new ramp). `90°` is never the
 * default rotation, so it always renders unselected/neutral.
 *
 * The standalone app is the only build where the theme toggle renders
 * (`src/ui/App.tsx`: `hostTheme == null` — an embedding host owns theme in
 * embed mode, ADR-017), so this drives that toggle rather than the embed
 * demo page used by `embed-actions.spec.ts`.
 *
 * One test per theme (not one per state): each fresh page load in this
 * harness costs ~15-20s of real navigation + IndexedDB init, and splitting
 * every state into its own test compounded that into a wall of sequential
 * full reloads that grew slower test over test until later ones blew past
 * Playwright's action timeout. Chaining resting -> hover -> active -> focus
 * inside a single page load per theme keeps this fast and deterministic.
 *
 * **Every computed-style read below is `expect.poll`, never a direct
 * `getComputedStyle` + `expect().toBe()`** (docs/testing.md: "synchronize on
 * conditions, never on wall-clock"). `shell.button` carries `transition-colors`
 * (this PR added it) — a theme flip, hover, or press all change which color a
 * `--shell-button-*` variable resolves to, and the browser interpolates the
 * *actual painted `background-color`* across the transition instead of
 * snapping instantly. A direct read can land mid-interpolation and observe
 * neither the old nor the new color as a stable value. This raced in CI (run
 * 31959121360): the dark-theme resting assertion read the still-transitioning
 * light background right after the toggle click, and the light-theme hover
 * assertion read the still-transitioning resting background right after
 * `hover()` — both passed locally because a fast dev machine's transition
 * settles inside the gap between the action and the next line, which is not
 * a guarantee. `expect.poll` re-reads until the color matches (or times out
 * for a real failure), which waits out the transition without a fixed sleep
 * and without disabling the transition under test.
 *
 * Token values asserted below (WCAG-computed, see `src/index.css` comments):
 *  - light: --shell-button-bg #e2e8f0, --shell-button-hover #cbd5e1,
 *    --shell-button-active #94a3b8, --shell-button-border #64748b,
 *    --shell-accent #2563eb
 *  - dark: --shell-button-bg #334155, --shell-button-hover #475569,
 *    --shell-button-active #5c6c84 (raised from #94a3b8 — 2.34:1 against
 *    --shell-text, failing 4.5:1 — to 4.87:1), --shell-button-border
 *    #64748b, --shell-accent #60a5fa
 */

const TOKEN = {
  light: {
    bg: 'rgb(226, 232, 240)',
    hover: 'rgb(203, 213, 225)',
    active: 'rgb(148, 163, 184)',
    border: 'rgb(100, 116, 139)',
    accent: 'rgb(37, 99, 235)',
  },
  dark: {
    bg: 'rgb(51, 65, 85)',
    hover: 'rgb(71, 85, 105)',
    active: 'rgb(92, 108, 132)',
    border: 'rgb(100, 116, 139)',
    accent: 'rgb(96, 165, 250)',
  },
} as const

type Theme = keyof typeof TOKEN

/** How long a poll may keep re-reading a computed style before failing for real. */
const SETTLE_TIMEOUT = 10_000

function backgroundColor(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor)
}

function borderTopColor(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).borderTopColor)
}

function boxShadow(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).boxShadow)
}

/**
 * Fresh mode is always `system` (no localStorage yet, isolated per-test
 * context). `nextThemeMode` order is system -> light -> dark -> system, so
 * one click always lands on `light`, two always land on `dark` — regardless
 * of whatever `prefers-color-scheme` the test runner's Chromium resolves
 * `system` to. Explicit modes force `resolvedTheme` directly, so this never
 * depends on OS/browser color-scheme emulation.
 *
 * The `data-theme` attribute flips the instant React applies the class
 * (no transition possible on an attribute), so waiting for it only proves
 * the *mode* changed — not that the button's `transition-colors` has
 * finished interpolating toward the new token color. The caller's first
 * `expect.poll` on the button's resting background is what actually waits
 * that out; this only waits for the mode switch itself.
 */
async function gotoWithTheme(page: Page, theme: Theme): Promise<void> {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /^Theme:/ })
  await expect(toggle).toBeVisible()
  const clicks = theme === 'light' ? 1 : 2
  for (let i = 0; i < clicks; i++) {
    await toggle.click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

function rotationButton(page: Page) {
  // `exact: true` — see the comment on `focusViaKeyboard` below: rotation
  // labels overlap as substrings ("90°"/"190°" is not a real case here, but
  // being explicit keeps this locator's intent unambiguous).
  return page.getByRole('button', { name: '90°', exact: true })
}

/**
 * Real keyboard Tab navigation, not `element.focus()` — Chromium only sets
 * `:focus-visible` when the last input modality was keyboard; a
 * script-invoked `.focus()` measured `boxShadow: none` in this exact harness
 * (an earlier version of this test used `el.focus()` and never observed a
 * ring in either theme). Walking the full Tab order from `document.body` was
 * also tried and abandoned: each press+check round-trip costs about a second
 * in this harness, so tabbing across the whole toolbar/sidebar blew past a
 * 60s test timeout before reaching the sidebar.
 *
 * Cheaper and just as real: click the *previous* rotation button (`0°`, the
 * default selection — clicking it re-selects the same rotation, a no-op) to
 * plant focus with the mouse, then press Tab exactly once. `0°` and `90°`
 * are adjacent siblings in `ROTATION_OPTIONS`' DOM order, so one Tab lands
 * on the target — via a real keyboard event, which is what flips the input
 * modality Chromium's `:focus-visible` heuristic checks.
 */
async function focusViaKeyboard(page: Page, target: ReturnType<typeof rotationButton>) {
  // `exact: true` matters: Playwright's accessible-name matching is a
  // substring match by default, and every other rotation label (90°, 180°,
  // 270°) contains the substring "0°" — an inexact match resolves to all
  // four buttons and throws a strict-mode violation.
  await page.getByRole('button', { name: '0°', exact: true }).click()
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

for (const theme of ['light', 'dark'] as const) {
  test(`neutral button chrome, computed (${theme} theme)`, async ({ page }) => {
    // Generous budget: a fresh page load in this harness alone costs
    // ~15-20s (full app boot + IndexedDB init), before any assertions run.
    test.setTimeout(120_000)
    await gotoWithTheme(page, theme)
    const button = rotationButton(page)

    // Resting: dedicated button-bg/border tokens, not the shared toolbar
    // surface (that's the original issue #132 regression). Also the poll
    // that waits out the theme-flip's own transition-colors interpolation
    // (see the file-level comment) before any per-theme value is asserted.
    await expect
      .poll(() => backgroundColor(button), { timeout: SETTLE_TIMEOUT })
      .toBe(TOKEN[theme].bg)
    await expect
      .poll(() => borderTopColor(button), { timeout: SETTLE_TIMEOUT })
      .toBe(TOKEN[theme].border)
    await expect.poll(() => boxShadow(button), { timeout: SETTLE_TIMEOUT }).toBe('none')

    // Hover: this is the exact button/assertion that would have caught the
    // Sidebar.tsx regression — a second `hover:bg-[var(--shell-hover)]`
    // utility stacked on `shell.button` there, and because the `--shell-hover`
    // rule lands later in the built CSS it won over `shell.button`'s own
    // `hover:bg-[var(--shell-button-hover)]`, leaving this one button on the
    // old dim hover while every sibling got the new ramp.
    await button.hover()
    await expect
      .poll(() => backgroundColor(button), { timeout: SETTLE_TIMEOUT })
      .toBe(TOKEN[theme].hover)

    // Active: a real mouse press, not the `:active` pseudo-class asserted by
    // name — release away from the button so no click fires (a completed
    // click flips canvas rotation to 90° and turns this button into the
    // *selected* accent variant, which would break every assertion after it).
    const box = await button.boundingBox()
    if (box == null) throw new Error('rotation button has no layout box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect
      .poll(() => backgroundColor(button), { timeout: SETTLE_TIMEOUT })
      .toBe(TOKEN[theme].active)
    await page.mouse.move(0, 0)
    await page.mouse.up()

    // Focus-visible: real Tab navigation. A single poll covers both "a ring
    // exists" and "it's the right color" — if the ring hasn't painted yet
    // (or never will), the string is `'none'` and `toContain` keeps failing
    // until it either settles to the accent color or the poll times out.
    await focusViaKeyboard(page, button)
    await expect
      .poll(() => boxShadow(button), { timeout: SETTLE_TIMEOUT })
      .toContain(TOKEN[theme].accent)
  })
}
