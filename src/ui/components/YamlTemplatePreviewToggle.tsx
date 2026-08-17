import type { ButtonHTMLAttributes } from 'react'
import { FeatureToggle } from './FeatureToggle'
import { MdiIcon } from './MdiIcon'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'

interface YamlTemplatePreviewToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'title'> {
  enabled: boolean
  onToggle: () => void
  showTextLabel?: boolean
  /**
   * True when a host owns the states (issue #107): the previewed values come
   * from its pushes, and there is no State Simulator to point the user at.
   */
  hostStatesFed?: boolean
}

/** Where the inline previews take their values from, in the user's terms. */
function previewTooltip(enabled: boolean, hostStatesFed: boolean): string {
  if (hostStatesFed) {
    return enabled
      ? 'Show resolved template values inline (live host states). Click to hide.'
      : 'Hide inline template previews. Click to show host-state values.'
  }
  return enabled
    ? 'Show resolved template values inline (State Simulator). Click to hide.'
    : 'Hide inline template previews. Click to show mock-evaluated values.'
}

export function YamlTemplatePreviewToggle({
  enabled,
  onToggle,
  showTextLabel = true,
  hostStatesFed = false,
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
      detailedTitle={previewTooltip(enabled, hostStatesFed)}
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
