import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { MdiIcon } from './MdiIcon'
import { ToolbarTooltip } from './ToolbarTooltip'
import { shell } from '../styles/shell'

type IconButtonVariant = 'default' | 'destructive'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  iconPath: string
  label?: ReactNode
  iconSize?: number
  /** Icon-only square button (28×28). */
  compact?: boolean
  variant?: IconButtonVariant
  /** Overrides {@link variant} surface; pass empty string when `className` carries full surface styles. */
  surfaceClass?: string
  /** Stable human label — used as `title` / `aria-label` when icon-only. */
  tooltip?: string
}

export function IconButton({
  iconPath,
  label,
  iconSize = 18,
  compact = label == null,
  variant = 'default',
  surfaceClass,
  className = '',
  title,
  tooltip,
  ...rest
}: IconButtonProps) {
  const isIconOnly = compact || label == null
  const resolvedTitle = title ?? tooltip ?? (typeof label === 'string' ? label : undefined)
  const resolvedSurface =
    surfaceClass ??
    (variant === 'destructive' ? shell.buttonDestructiveIcon : shell.button)
  const disabledClass =
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--shell-surface-2)]'
  const baseClass = compact
    ? `${resolvedSurface} ${disabledClass} flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 p-0`.trim()
    : `${resolvedSurface} ${disabledClass} inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-1`.trim()

  const button = (
    <button
      type="button"
      className={`${baseClass} ${className}`.trim()}
      title={isIconOnly ? resolvedTitle : title}
      aria-label={typeof label === 'string' ? label : resolvedTitle}
      {...rest}
    >
      <MdiIcon path={iconPath} size={iconSize} className="shrink-0" />
      {label != null ? <span className="text-xs">{label}</span> : null}
    </button>
  )

  if (isIconOnly && resolvedTitle) {
    return <ToolbarTooltip label={resolvedTitle}>{button}</ToolbarTooltip>
  }

  return button
}
