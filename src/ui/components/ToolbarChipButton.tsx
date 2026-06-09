import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { toolbarChipClassName } from '../lib/toolbar-button'

interface ToolbarChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

export function ToolbarChipButton({
  active = false,
  className = '',
  children,
  ...rest
}: ToolbarChipButtonProps) {
  return (
    <button type="button" className={`${toolbarChipClassName(active)} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}
