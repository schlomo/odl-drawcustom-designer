import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

interface YamlCouplingToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function YamlCouplingToggle({ enabled, onToggle }: YamlCouplingToggleProps) {
  return (
    <FeatureToggle
      enabled={enabled}
      onToggle={onToggle}
      title={
        enabled
          ? 'YAML, canvas, and element list stay in sync. Click to unlink.'
          : 'Editors are independent. Click to link YAML, canvas, and list.'
      }
    >
      <MdiIcon path={enabled ? TOOL_ICONS.linkOn : TOOL_ICONS.linkOff} size={14} />
      <span>Linked</span>
    </FeatureToggle>
  )
}
