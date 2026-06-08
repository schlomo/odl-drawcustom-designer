import type { ReactNode } from 'react'
import {
  getExportActionButtonClassName,
  type ExportActionFeedback,
} from '../lib/export-action-feedback'

interface ExportActionButtonProps {
  actionId: string
  feedback: ExportActionFeedback | null
  onClick: () => void
  children: ReactNode
}

export function ExportActionButton({
  actionId,
  feedback,
  onClick,
  children,
}: ExportActionButtonProps) {
  return (
    <button
      type="button"
      className={getExportActionButtonClassName(feedback)}
      onClick={onClick}
      data-export-action={actionId}
      aria-live="polite"
    >
      {children}
    </button>
  )
}
