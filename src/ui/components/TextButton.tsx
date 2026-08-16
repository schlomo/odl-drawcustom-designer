import type { ButtonHTMLAttributes } from 'react'
import { disabledButton, shell } from '../styles/shell'

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
  return (
    <button type="button" className={`${surface} ${disabledButton} ${className}`.trim()} {...rest} />
  )
}
