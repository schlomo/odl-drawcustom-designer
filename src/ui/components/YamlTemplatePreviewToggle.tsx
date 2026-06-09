import type { ButtonHTMLAttributes } from 'react'
import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

interface YamlTemplatePreviewToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  enabled: boolean
  onToggle: () => void
  showTextLabel?: boolean
}

export function YamlTemplatePreviewToggle({
  enabled,
  onToggle,
  showTextLabel = true,
  className,
  ...rest
}: YamlTemplatePreviewToggleProps) {
  return (
    <FeatureToggle
      enabled={enabled}
      onToggle={onToggle}
      textLabel="Preview"
      showTextLabel={showTextLabel}
      className={className}
      detailedTitle={
        enabled
          ? 'Show resolved template values inline (State Simulator). Click to hide.'
          : 'Hide inline template previews. Click to show mock-evaluated values.'
      }
      {...rest}
    >
      {showTextLabel ? (
        <span>Preview</span>
      ) : (
        <MdiIcon path={TOOL_ICONS.preview} size={16} className="shrink-0" />
      )}
    </FeatureToggle>
  )
}
