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
  /** Why the action failed — shown as a visible bubble during an error flash (issue #76). */
  feedbackMessage?: string | null
  iconPath: string
  label?: ReactNode
  /** Stable text for tooltip when `label` is hidden (icon-only). */
  tooltip?: string
  onClick: () => void
}

export function ExportIconButton({
  actionId,
  feedback,
  feedbackMessage,
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
  const errorMessage = feedback === 'error' ? (feedbackMessage ?? null) : null

  const button = (
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

  if (errorMessage == null) {
    return button
  }

  return (
    <span className="relative inline-flex shrink-0">
      {button}
      <span
        role="alert"
        data-testid="export-action-error"
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 whitespace-nowrap rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-danger-border)] px-2 py-1 text-xs text-white shadow-md"
      >
        {errorMessage}
      </span>
    </span>
  )
}
