import { shell } from '../styles/shell'

export type ExportActionFeedback = 'success' | 'error'

/** How long export buttons stay highlighted after an action. */
export const EXPORT_ACTION_FEEDBACK_MS = 1500

/** Shared sizing for export toolbar buttons (without default surface colors). */
const exportActionButtonBase =
  'rounded-md border px-2 py-1 text-xs transition-colors hover:opacity-95'

export function getExportActionButtonClassName(
  feedback: ExportActionFeedback | null | undefined,
  baseClass: string = shell.button,
): string {
  switch (feedback) {
    case 'success':
      return `${exportActionButtonBase} border-[var(--shell-success-border)] bg-[var(--shell-success-bg)] text-[var(--shell-success-fg)] shadow-inner ring-1 ring-inset ring-black/10`
    case 'error':
      return `${exportActionButtonBase} border-[var(--shell-danger-border)] bg-[var(--shell-danger-border)] text-white shadow-inner ring-1 ring-inset ring-black/10`
    default:
      return baseClass
  }
}

/** Toolbar layout: grouped controls with spacing between groups. */
export const toolbarGroups = 'flex flex-wrap items-center justify-end gap-x-4 gap-y-2'
export const toolbarGroup = 'flex flex-wrap items-center gap-1'
export const toolbarDivider = 'mx-0.5 h-4 w-px shrink-0 bg-[var(--shell-border)]'
export const floatingToolbarShell =
  'pointer-events-auto flex items-center gap-1 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)]/95 px-1 py-0.5 shadow-md backdrop-blur-sm'
