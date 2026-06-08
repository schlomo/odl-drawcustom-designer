import type { ReactNode } from 'react'
import {
  getExportActionButtonClassName,
  type ExportActionFeedback,
} from '../lib/export-action-feedback'
import { IconButton } from './IconButton'

interface ExportIconButtonProps {
  actionId: string
  feedback: ExportActionFeedback | null
  iconPath: string
  label: ReactNode
  onClick: () => void
}

export function ExportIconButton({
  actionId,
  feedback,
  iconPath,
  label,
  onClick,
}: ExportIconButtonProps) {
  return (
    <IconButton
      iconPath={iconPath}
      label={label}
      className={getExportActionButtonClassName(feedback)}
      onClick={onClick}
      data-export-action={actionId}
      aria-live="polite"
      title={typeof label === 'string' ? label : undefined}
    />
  )
}
