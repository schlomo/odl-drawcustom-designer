import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { toggleButtonClassName } from '../lib/toolbar-button'
import { collapsedToolbarTooltip } from '../lib/toolbar-tooltip'
import { ToolbarTooltip } from './ToolbarTooltip'

interface FeatureToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  enabled: boolean
  onToggle: () => void
  /** Human-readable control name — always used as tooltip when icon-only. */
  textLabel: string
  /** Optional longer tooltip when the text label is visible. */
  detailedTitle?: string
  /** When false, `title` is `textLabel` (icon-only collapse). */
  showTextLabel?: boolean
  children: ReactNode
}

export function FeatureToggle({
  enabled,
  onToggle,
  textLabel,
  detailedTitle,
  showTextLabel = true,
  children,
  className = '',
  ...rest
}: FeatureToggleProps) {
  const tooltip = collapsedToolbarTooltip(textLabel, showTextLabel, detailedTitle)

  const button = (
    <button
      type="button"
      className={toggleButtonClassName(enabled, className)}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={textLabel}
      title={tooltip}
      {...rest}
    >
      {children}
    </button>
  )

  if (!showTextLabel) {
    return <ToolbarTooltip label={textLabel}>{button}</ToolbarTooltip>
  }

  return button
}
