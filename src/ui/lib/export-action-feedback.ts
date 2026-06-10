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

/** Single-row toolbar chrome — labels collapse to icons when narrow (ADR-014). */
export const toolbarGroupsRow =
  'flex min-w-0 max-w-full flex-nowrap items-center gap-x-2 overflow-visible'
export const toolbarGroupRow = 'flex shrink-0 flex-nowrap items-center gap-1'
export const toolbarDivider = 'mx-0.5 h-4 w-px shrink-0 bg-[var(--shell-border)]'
export const floatingToolbarShell =
  'pointer-events-auto flex max-w-[90%] flex-nowrap items-center gap-1 overflow-visible rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)]/95 px-1 py-0.5 shadow-md backdrop-blur-sm'
