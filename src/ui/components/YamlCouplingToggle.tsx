import type { ButtonHTMLAttributes } from 'react'
import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

interface YamlCouplingToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  enabled: boolean
  onToggle: () => void
  showTextLabel?: boolean
}

export function YamlCouplingToggle({
  enabled,
  onToggle,
  showTextLabel = true,
  className,
  ...rest
}: YamlCouplingToggleProps) {
  return (
    <FeatureToggle
      enabled={enabled}
      onToggle={onToggle}
      textLabel="Linked"
      showTextLabel={showTextLabel}
      className={className}
      detailedTitle={
        enabled
          ? 'YAML, canvas, and element list stay in sync. Click to unlink.'
          : 'Editors are independent. Click to link YAML, canvas, and list.'
      }
      {...rest}
    >
      <MdiIcon path={enabled ? TOOL_ICONS.linkOn : TOOL_ICONS.linkOff} size={14} className="shrink-0" />
      {showTextLabel ? <span>Linked</span> : null}
    </FeatureToggle>
  )
}
