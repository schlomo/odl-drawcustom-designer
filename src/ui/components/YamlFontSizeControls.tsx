import {
  YAML_FONT_SIZE_MAX,
  YAML_FONT_SIZE_MIN,
} from '../preferences/yamlFontSize'
import { TOOL_ICONS } from '../lib/mdi-tool-icons'
import { toolbarGroupRow } from '../lib/export-action-feedback'
import { IconButton } from './IconButton'

interface YamlFontSizeControlsProps {
  fontSize: number
  onDecrease: () => void
  onIncrease: () => void
  showLabels?: boolean
}

export function YamlFontSizeControls({
  fontSize,
  onDecrease,
  onIncrease,
  showLabels = true,
}: YamlFontSizeControlsProps) {
  return (
    <div className={toolbarGroupRow} role="group" aria-label="YAML editor font size">
      <IconButton
        compact
        iconPath={TOOL_ICONS.fontDecrease}
        tooltip="Decrease YAML font size"
        disabled={fontSize <= YAML_FONT_SIZE_MIN}
        onClick={onDecrease}
        data-yaml-toolbar
      />
      {showLabels ? (
        <span
          className="min-w-12 shrink-0 text-center text-xs text-[var(--shell-muted)]"
          aria-live="polite"
          data-yaml-toolbar
        >
          {fontSize}px
        </span>
      ) : null}
      <IconButton
        compact
        iconPath={TOOL_ICONS.fontIncrease}
        tooltip="Increase YAML font size"
        disabled={fontSize >= YAML_FONT_SIZE_MAX}
        onClick={onIncrease}
        data-yaml-toolbar
      />
    </div>
  )
}
