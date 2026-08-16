import { describe, expect, it } from 'vitest'
import { disabledButton, shell } from '../../../src/ui/styles/shell'

/**
 * Issue #132: toolbar buttons must read as buttons in both themes — a
 * visible border and a surface distinct from the toolbar background, with
 * consistent hover/active/focus-visible states. Tailwind v4's arbitrary-value
 * syntax (`bg-[var(--foo)]`) means the literal string in `shell.ts` is
 * exactly what the compiled CSS selector targets, so asserting the class
 * string is a built-CSS assertion (same pattern as
 * `tests/ui/lib/toolbar-button.test.ts`), not an internal-hook check.
 *
 * Token contrast (WCAG relative-luminance formula, computed, not eyeballed —
 * see index.css comments for the full numbers): --shell-button-border vs
 * --shell-bg is 4.55:1 (light) / 3.75:1 (dark), both clearing the ~3:1
 * non-text/UI-component contrast guideline. --shell-warning-border was
 * raised the same way: 1.38:1 (light, before) -> 4.80:1 (after); ~2.6:1
 * (dark, before) -> 4.63:1 (after).
 */
describe('shell button chrome (issue #132)', () => {
  it('gives every neutral button surface a dedicated, visible border token', () => {
    for (const surface of [shell.button, shell.buttonIcon]) {
      expect(surface).toContain('border-[var(--shell-button-border)]')
      expect(surface).toContain('bg-[var(--shell-button-bg)]')
      expect(surface).not.toContain('--shell-surface-2')
    }
  })

  it('gives every neutral button consistent hover/active/focus-visible states', () => {
    for (const surface of [shell.button, shell.buttonIcon]) {
      expect(surface).toContain('hover:bg-[var(--shell-button-hover)]')
      expect(surface).toContain('active:bg-[var(--shell-button-active)]')
      expect(surface).toContain('focus-visible:ring-2')
      expect(surface).toContain('focus-visible:ring-[var(--shell-accent)]')
    }
  })

  it('keeps destructive/caution severity borders and text, on the shared neutral fill', () => {
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

  it('every button variant gets a focus-visible ring', () => {
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

  it('disabled-hover fallback now defaults to the button surface token, not surface-2', () => {
    expect(disabledButton).toContain(
      'disabled:hover:bg-[var(--shell-button-surface,var(--shell-button-bg))]',
    )
    expect(disabledButton).not.toContain('--shell-surface-2')
  })
})
