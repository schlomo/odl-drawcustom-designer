import {
  YAML_FONT_SIZE_MAX,
  YAML_FONT_SIZE_MIN,
} from '../preferences/yamlFontSize'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import { toolbarGroup } from '../lib/export-action-feedback'
import { IconButton } from './IconButton'

interface YamlFontSizeControlsProps {
  fontSize: number
  onDecrease: () => void
  onIncrease: () => void
}

export function YamlFontSizeControls({
  fontSize,
  onDecrease,
  onIncrease,
}: YamlFontSizeControlsProps) {
  return (
    <div className={toolbarGroup} role="group" aria-label="YAML editor font size">
      <IconButton
        compact
        iconPath={TOOL_ICONS.fontDecrease}
        title="Decrease YAML font size"
        disabled={fontSize <= YAML_FONT_SIZE_MIN}
        onClick={onDecrease}
      />
      <span className="min-w-12 text-center text-xs text-[var(--shell-muted)]" aria-live="polite">
        {fontSize}px
      </span>
      <IconButton
        compact
        iconPath={TOOL_ICONS.fontIncrease}
        title="Increase YAML font size"
        disabled={fontSize >= YAML_FONT_SIZE_MAX}
        onClick={onIncrease}
      />
    </div>
  )
}
