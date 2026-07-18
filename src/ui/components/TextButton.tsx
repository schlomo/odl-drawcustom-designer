import type { ButtonHTMLAttributes } from 'react'
import { shell } from '../styles/shell'

type TextButtonVariant = 'default' | 'destructive'

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TextButtonVariant
}

export function TextButton({ variant = 'default', className = '', ...rest }: TextButtonProps) {
  const surface = variant === 'destructive' ? shell.buttonDestructive : shell.button
  const disabledClass =
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--shell-surface-2)]'
  return <button type="button" className={`${surface} ${disabledClass} ${className}`.trim()} {...rest} />
}
