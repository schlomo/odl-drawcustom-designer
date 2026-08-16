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
  button:
    'rounded-md border border-[var(--shell-border)] bg-[var(--shell-surface-2)] px-2 py-1 text-xs text-[var(--shell-text)] hover:bg-[var(--shell-hover)]',
  buttonDestructive:
    'rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-surface-2)] px-2 py-1 text-xs text-[var(--shell-danger)] transition-colors hover:bg-[var(--shell-danger-hover)]',
  /** Compact icon button — same destructive palette as {@link shell.buttonDestructive}. */
  buttonDestructiveIcon:
    'rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-surface-2)] text-[var(--shell-danger)] transition-colors hover:bg-[var(--shell-danger-hover)]',
  /**
   * Amber "this reaches beyond the designer" surface — one step below
   * destructive red (host action `severity: 'caution'`, issue #108; same
   * palette as the standing export warning).
   */
  buttonCaution:
    'rounded-md border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] px-2 py-1 text-xs text-[var(--shell-warning-fg)] transition-colors hover:bg-[var(--shell-warning-hover)]',
  /** Compact icon button — same caution palette as {@link shell.buttonCaution}. */
  buttonCautionIcon:
    'rounded-md border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] text-[var(--shell-warning-fg)] transition-colors hover:bg-[var(--shell-warning-hover)]',
  buttonActive: 'bg-[var(--shell-hover)]',
} as const
