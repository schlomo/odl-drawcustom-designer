import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  getExportActionButtonClassName,
  type ExportActionFeedback,
} from '../lib/export-action-feedback'
import { shell } from '../styles/shell'
import { IconButton } from './IconButton'

interface ExportIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> {
  actionId: string
  feedback: ExportActionFeedback | null
  iconPath: string
  label?: ReactNode
  /** Stable text for tooltip when `label` is hidden (icon-only). */
  tooltip?: string
  onClick: () => void
}

export function ExportIconButton({
  actionId,
  feedback,
  iconPath,
  label,
  tooltip,
  onClick,
  disabled = false,
  title,
  ...rest
}: ExportIconButtonProps) {
  const isFlash = feedback != null
  const textLabel = tooltip ?? (typeof label === 'string' ? label : undefined)
  const isIconOnly = label == null

  return (
    <IconButton
      iconPath={iconPath}
      label={label}
      tooltip={textLabel}
      surfaceClass={isFlash ? '' : shell.button}
      className={isFlash ? getExportActionButtonClassName(feedback) : ''}
      onClick={onClick}
      disabled={disabled}
      data-export-action={actionId}
      aria-live="polite"
      title={isIconOnly ? (title ?? textLabel) : title}
      {...rest}
    />
  )
}
