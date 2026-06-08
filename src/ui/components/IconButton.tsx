import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { MdiIcon } from './MdiIcon'
import { shell } from '../styles/shell'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  iconPath: string
  label?: ReactNode
  iconSize?: number
  /** Icon-only square button (28×28). */
  compact?: boolean
}

export function IconButton({
  iconPath,
  label,
  iconSize = 18,
  compact = label == null,
  className = '',
  title,
  ...rest
}: IconButtonProps) {
  const baseClass = compact
    ? `${shell.button} flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 p-0`
    : `${shell.button} inline-flex items-center gap-1.5 px-2 py-1`

  return (
    <button
      type="button"
      className={`${baseClass} ${className}`.trim()}
      title={title}
      aria-label={typeof label === 'string' ? label : title}
      {...rest}
    >
      <MdiIcon path={iconPath} size={iconSize} className="shrink-0" />
      {label != null ? <span className="text-xs">{label}</span> : null}
    </button>
  )
}
