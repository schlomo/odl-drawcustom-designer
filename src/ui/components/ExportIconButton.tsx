import { useId } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  EXPORT_ACTION_WARNING_CLASS,
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
  /**
   * Standing availability warning (issue #80): when set, the button is
   * warning-marked from first paint — amber surface, corner badge, and a
   * hover/focus hint bubble wired in as the accessible description. The
   * button stays enabled so the post-click error alert remains a backstop.
   */
  warning?: string | null
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
  warning,
  iconPath,
  label,
  tooltip,
  onClick,
  disabled = false,
  title,
  ...rest
}: ExportIconButtonProps) {
  const hintId = useId()
  const isFlash = feedback != null
  // Feedback flashes (success/error) temporarily outrank the standing warning.
  const warningActive = !isFlash && warning != null
  const textLabel = tooltip ?? (typeof label === 'string' ? label : undefined)
  const isIconOnly = label == null
  const errorMessage = feedback === 'error' ? (feedbackMessage ?? null) : null

  const button = (
    <IconButton
      iconPath={iconPath}
      label={label}
      tooltip={textLabel}
      surfaceClass={isFlash || warningActive ? '' : shell.button}
      className={
        isFlash
          ? getExportActionButtonClassName(feedback)
          : warningActive
            ? EXPORT_ACTION_WARNING_CLASS
            : ''
      }
      onClick={onClick}
      disabled={disabled}
      data-export-action={actionId}
      aria-live="polite"
      aria-describedby={warningActive ? hintId : undefined}
      title={isIconOnly ? (title ?? textLabel) : title}
      {...rest}
    />
  )

  if (errorMessage == null && !warningActive) {
    return button
  }

  return (
    <span className="group relative inline-flex shrink-0">
      {button}
      {warningActive ? (
        <>
          <span
            aria-hidden
            data-testid="export-action-warning-badge"
            className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--shell-warning-border)] bg-[var(--shell-warning-fg)] text-[10px] font-bold leading-none text-[var(--shell-warning-bg)]"
          >
            !
          </span>
          <span
            id={hintId}
            data-testid="export-action-warning-hint"
            className="pointer-events-none invisible absolute right-0 top-[calc(100%+6px)] z-50 whitespace-nowrap rounded-md border border-[var(--shell-warning-border)] bg-[var(--shell-warning-bg)] px-2 py-1 text-xs text-[var(--shell-warning-fg)] opacity-0 shadow-md transition-opacity duration-75 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
          >
            {warning}
          </span>
        </>
      ) : null}
      {errorMessage != null ? (
        <span
          role="alert"
          data-testid="export-action-error"
          className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 whitespace-nowrap rounded-md border border-[var(--shell-danger-border)] bg-[var(--shell-danger-border)] px-2 py-1 text-xs text-white shadow-md"
        >
          {errorMessage}
        </span>
      ) : null}
    </span>
  )
}
