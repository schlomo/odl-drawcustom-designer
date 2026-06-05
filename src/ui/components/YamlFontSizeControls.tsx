import {
  YAML_FONT_SIZE_MAX,
  YAML_FONT_SIZE_MIN,
} from '../preferences/yamlFontSize'
import { shell } from '../styles/shell'

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
    <div className="flex items-center gap-1" role="group" aria-label="YAML editor font size">
      <button
        type="button"
        className={shell.button}
        onClick={onDecrease}
        disabled={fontSize <= YAML_FONT_SIZE_MIN}
        aria-label="Decrease YAML font size"
      >
        A−
      </button>
      <span className="min-w-12 text-center text-xs text-[var(--shell-muted)]" aria-live="polite">
        {fontSize}px
      </span>
      <button
        type="button"
        className={shell.button}
        onClick={onIncrease}
        disabled={fontSize >= YAML_FONT_SIZE_MAX}
        aria-label="Increase YAML font size"
      >
        A+
      </button>
    </div>
  )
}
