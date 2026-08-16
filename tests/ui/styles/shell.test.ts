import { describe, expect, it } from 'vitest'
import { disabledButton, shell } from '../../../src/ui/styles/shell'

/**
 * Issue #132: toolbar buttons must read as buttons in both themes — a
 * visible border and a surface distinct from the toolbar background, with
 * consistent hover/active/focus-visible states.
 *
 * These are **source-level** checks only: they grep the literal Tailwind
 * arbitrary-value strings (`bg-[var(--foo)]`) in `shell.ts`, which proves
 * each button variant *references* the right CSS custom property — but
 * Vitest/jsdom never runs Tailwind, so a wrong *value* assigned to that same
 * property in `index.css` (e.g. a token retuned to a color that fails
 * contrast) would still pass every assertion here. They're a cheap tripwire
 * against a class string silently drifting to the wrong variable name or
 * losing a state — not a substitute for verifying the actual painted
 * colors. That verification is real computed-style coverage in
 * `tests/e2e/embed-actions.spec.ts` (`neutral button chrome, computed`
 * describe block), which reads `getComputedStyle` on a real built page in
 * both themes.
 *
 * Token contrast (WCAG relative-luminance formula, computed, not eyeballed —
 * see index.css comments for the full numbers): --shell-button-border vs
 * --shell-bg is 4.55:1 (light) / 3.75:1 (dark), both clearing the ~3:1
 * non-text/UI-component contrast guideline. --shell-warning-border was
 * raised the same way: 1.38:1 (light, before) -> 4.80:1 (after); ~2.6:1
 * (dark, before) -> 4.63:1 (after). --shell-button-active (dark) was raised
 * from #94a3b8 (2.34:1 vs --shell-text, failing 4.5:1) to #5c6c84 (4.87:1).
 */
describe('shell button chrome source strings (issue #132)', () => {
  it('source string: gives every neutral button surface a dedicated, visible border token', () => {
    for (const surface of [shell.button, shell.buttonIcon]) {
      expect(surface).toContain('border-[var(--shell-button-border)]')
      expect(surface).toContain('bg-[var(--shell-button-bg)]')
      expect(surface).not.toContain('--shell-surface-2')
    }
  })

  it('source string: gives every neutral button consistent hover/active/focus-visible states', () => {
    for (const surface of [shell.button, shell.buttonIcon]) {
      expect(surface).toContain('hover:bg-[var(--shell-button-hover)]')
      expect(surface).toContain('active:bg-[var(--shell-button-active)]')
      expect(surface).toContain('focus-visible:ring-2')
      expect(surface).toContain('focus-visible:ring-[var(--shell-accent)]')
    }
  })

  it('source string: keeps destructive/caution severity borders and text, on the shared neutral fill', () => {
    for (const surface of [shell.buttonDestructive, shell.buttonDestructiveIcon]) {
      expect(surface).toContain('border-[var(--shell-danger-border)]')
      expect(surface).toContain('text-[var(--shell-danger)]')
      expect(surface).toContain('bg-[var(--shell-button-bg)]')
      expect(surface).toContain('hover:bg-[var(--shell-danger-hover)]')
      expect(surface).toContain('active:bg-[var(--shell-danger-active)]')
    }

    for (const surface of [shell.buttonCaution, shell.buttonCautionIcon]) {
      expect(surface).toContain('border-[var(--shell-warning-border)]')
      expect(surface).toContain('text-[var(--shell-warning-fg)]')
      expect(surface).toContain('hover:bg-[var(--shell-warning-hover)]')
      expect(surface).toContain('active:bg-[var(--shell-warning-active)]')
    }
  })

  it('source string: every button variant gets a focus-visible ring', () => {
    for (const surface of [
      shell.button,
      shell.buttonIcon,
      shell.buttonDestructive,
      shell.buttonDestructiveIcon,
      shell.buttonCaution,
      shell.buttonCautionIcon,
    ]) {
      expect(surface).toContain('focus-visible:ring-2')
      expect(surface).toContain('focus-visible:ring-[var(--shell-accent)]')
    }
  })

  it('source string: disabled-hover fallback now defaults to the button surface token, not surface-2', () => {
    expect(disabledButton).toContain(
      'disabled:hover:bg-[var(--shell-button-surface,var(--shell-button-bg))]',
    )
    expect(disabledButton).not.toContain('--shell-surface-2')
  })
})
