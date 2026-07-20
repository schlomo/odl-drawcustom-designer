import type { ReactNode } from 'react'
import { ELEMENT_TEMPLATE_ICON } from '../../lib/element-type-icons'
import { IconButton } from '../IconButton'

interface TemplateToggleButtonProps {
  active?: boolean
  onClick: () => void
  literalLabel?: string
}

export function TemplateToggleButton({
  active = false,
  onClick,
  literalLabel = 'Literal value',
}: TemplateToggleButtonProps) {
  return (
    <IconButton
      iconPath={ELEMENT_TEMPLATE_ICON}
      compact
      // The button sits at the property panel's right edge — a centered
      // bubble would stick out past the panel and become clipped (issue #83).
      tooltipAlign="end"
      tooltip={active ? `Back to ${literalLabel.toLowerCase()}` : 'Template expression (or type {)'}
      aria-pressed={active}
      className={active ? 'ring-1 ring-[var(--shell-accent)]' : ''}
      onClick={onClick}
    />
  )
}

interface PropertyFieldControlProps {
  label: ReactNode
  children: ReactNode
  trailing?: ReactNode
  className?: string
}

/** Label + single-row control (input/select + optional trailing button). */
export function PropertyFieldControl({
  label,
  children,
  trailing,
  className = '',
}: PropertyFieldControlProps) {
  return (
    <div className={`block text-xs ${className}`.trim()}>
      {label}
      {trailing ? (
        <div className="mt-1 flex items-start gap-1">
          <div className="min-w-0 flex-1">{children}</div>
          {trailing}
        </div>
      ) : (
        <div className="mt-1">{children}</div>
      )}
    </div>
  )
}
