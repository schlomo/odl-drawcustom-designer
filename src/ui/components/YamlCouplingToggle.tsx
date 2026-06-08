import { FeatureToggle } from './FeatureToggle'
import { LinkCouplingIcon } from './LinkCouplingIcon'

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
      <LinkCouplingIcon />
      <span>Linked</span>
    </FeatureToggle>
  )
}
