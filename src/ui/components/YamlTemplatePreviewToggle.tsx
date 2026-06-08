import { FeatureToggle } from './FeatureToggle'

interface YamlTemplatePreviewToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function YamlTemplatePreviewToggle({ enabled, onToggle }: YamlTemplatePreviewToggleProps) {
  return (
    <FeatureToggle
      enabled={enabled}
      onToggle={onToggle}
      title={
        enabled
          ? 'Show resolved template values inline (State Simulator). Click to hide.'
          : 'Hide inline template previews. Click to show mock-evaluated values.'
      }
    >
      <span>Preview</span>
    </FeatureToggle>
  )
}
