/** Shared shell classes driven by CSS variables in index.css */
export const shell = {
  app: 'flex h-screen flex-col bg-[var(--shell-bg)] text-[var(--shell-text)]',
  /** Embedded mount: fill the host-sized container instead of the viewport. */
  appEmbedded: 'flex h-full flex-col bg-[var(--shell-bg)] text-[var(--shell-text)]',
  header: 'shrink-0 border-b border-[var(--shell-border)] px-6 py-2',
  panel: 'bg-[var(--shell-surface)]',
  panelBorder: 'border-[var(--shell-border)]',
  muted: 'text-[var(--shell-muted)]',
  heading: 'text-sm font-medium uppercase tracking-wide text-[var(--shell-muted)]',
  input:
    'rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface-2)] px-2 py-1.5 text-sm text-[var(--shell-text)]',
  /**
   * Every button surface below also declares `--shell-button-surface`: its
   * own resting background. That is what a *disabled* button paints on hover
   * (see {@link disabledButton}) — hovering a disabled button is how its
   * reason gets read, so it must not repaint itself as a different button at
   * that exact moment.
   *
   * All three variants share the `--shell-button-*` ramp (index.css) for
   * their resting surface and neutral hover/active/focus states — a
   * dedicated token family (issue #132) rather than the general
   * `--shell-surface-2` / `--shell-hover`, which in dark mode collapsed a
   * button's surface onto the page background (0 contrast) and are shared
   * with unrelated chrome this issue doesn't touch. Only the *border* and
   * *text/fill hover tint* differ per severity, keeping the amber/red
   * identity from issue #108.
   */
  button:
    'rounded-md border border-[var(--shell-button-border)] bg-[var(--shell-button-bg)] [--shell-button-surface:var(--shell-button-bg)] px-2 py-1 text-xs text-[var(--shell-text)] transition-colors hover:bg-[var(--shell-button-hover)] active:bg-[var(--shell-button-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  /** Compact icon button — same neutral palette as {@link shell.button}, without its padding. */
  buttonIcon:
    'rounded-md border border-[var(--shell-button-border)] bg-[var(--shell-button-bg)] [--shell-button-surface:var(--shell-button-bg)] text-[var(--shell-text)] transition-colors hover:bg-[var(--shell-button-hover)] active:bg-[var(--shell-button-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  buttonDestructive:
    'rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-button-bg)] [--shell-button-surface:var(--shell-button-bg)] px-2 py-1 text-xs text-[var(--shell-danger)] transition-colors hover:bg-[var(--shell-danger-hover)] active:bg-[var(--shell-danger-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  /** Compact icon button — same destructive palette as {@link shell.buttonDestructive}. */
  buttonDestructiveIcon:
    'rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-button-bg)] [--shell-button-surface:var(--shell-button-bg)] text-[var(--shell-danger)] transition-colors hover:bg-[var(--shell-danger-hover)] active:bg-[var(--shell-danger-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  /**
   * Amber "this reaches beyond the designer" surface — one step below
   * destructive red (host action `severity: 'caution'`, issue #108; same
   * palette as the standing export warning).
   */
  buttonCaution:
    'rounded-md border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] [--shell-button-surface:var(--shell-warning-bg)] px-2 py-1 text-xs text-[var(--shell-warning-fg)] transition-colors hover:bg-[var(--shell-warning-hover)] active:bg-[var(--shell-warning-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  /** Compact icon button — same caution palette as {@link shell.buttonCaution}. */
  buttonCautionIcon:
    'rounded-md border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] [--shell-button-surface:var(--shell-warning-bg)] text-[var(--shell-warning-fg)] transition-colors hover:bg-[var(--shell-warning-hover)] active:bg-[var(--shell-warning-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
  buttonActive: 'bg-[var(--shell-button-active)]',
} as const

/**
 * Disabled-button chrome shared by every button component.
 *
 * The hover background resolves to the button's **own** resting surface
 * (`--shell-button-surface`, declared by each surface class above), with the
 * neutral button surface as the fallback for a caller passing fully custom
 * surface styles. Hardcoding one colour here flipped disabled caution/danger
 * buttons to the neutral surface under the pointer — precisely when the user
 * is hovering to read why they are disabled.
 */
export const disabledButton =
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--shell-button-surface,var(--shell-button-bg))]'
