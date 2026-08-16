import type { ButtonHTMLAttributes } from 'react'
import { shell } from '../styles/shell'

type TextButtonVariant = 'default' | 'caution' | 'destructive'

const SURFACES: Record<TextButtonVariant, string> = {
  default: shell.button,
  caution: shell.buttonCaution,
  destructive: shell.buttonDestructive,
}

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TextButtonVariant
}

export function TextButton({ variant = 'default', className = '', ...rest }: TextButtonProps) {
  const surface = SURFACES[variant]
  const disabledClass =
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--shell-surface-2)]'
  return <button type="button" className={`${surface} ${disabledClass} ${className}`.trim()} {...rest} />
}
