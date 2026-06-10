import type { StatusSeverity } from './status-messages'

export const STATUS_SURFACE_CLASSES: Record<StatusSeverity, string> = {
  error:
    'border-[var(--shell-danger-border)] bg-[var(--shell-danger-hover)] text-[var(--shell-danger)]',
  warning:
    'border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] text-[var(--shell-warning-fg)]',
  info: 'border-sky-300 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100',
}

export const STATUS_TEXT_CLASSES: Record<StatusSeverity, string> = {
  error: 'text-[var(--shell-danger)]',
  warning: 'text-[var(--shell-warning-fg)]',
  info: 'text-sky-900 dark:text-sky-50',
}

export function statusSurfaceClassName(severity: StatusSeverity): string {
  return STATUS_SURFACE_CLASSES[severity]
}

export function statusTextClassName(severity: StatusSeverity): string {
  return STATUS_TEXT_CLASSES[severity]
}

/** Layer list row highlight — keeps normal text contrast in light and dark themes. */
export function statusRowClassName(severity: StatusSeverity): string {
  if (severity === 'warning') {
    return 'border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-warning-hover)]'
  }
  if (severity === 'error') {
    return 'border border-[var(--shell-danger-border)] bg-[var(--shell-danger-hover)] text-[var(--shell-text)] hover:bg-[var(--shell-danger-hover)]'
  }
  return 'border border-sky-300 bg-sky-50 text-[var(--shell-text)] dark:border-sky-500/30 dark:bg-sky-950/40'
}
