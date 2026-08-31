import { themeIconPath } from '../lib/mdi-tool-icons'
import { themeModeLabel, type ThemeMode } from '../preferences/theme'
import { IconButton } from './IconButton'

interface ThemeToggleProps {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  /** Icon-only when false — the page header collapses its labels (ADR-016). */
  showLabel?: boolean
  onCycle: () => void
}

export function ThemeToggle({ mode, resolvedTheme, showLabel = true, onCycle }: ThemeToggleProps) {
  const detail =
    mode === 'system' ? `Using ${resolvedTheme} from system` : `Using ${resolvedTheme} theme`
  const label = `Theme: ${themeModeLabel(mode)}. ${detail}. Click to change.`

  const textLabel = themeModeLabel(mode)

  return (
    <IconButton
      iconPath={themeIconPath(mode)}
      label={showLabel ? textLabel : undefined}
      tooltip={textLabel}
      tooltipPlacement="below"
      tooltipAlign="end"
      onClick={onCycle}
      title={label}
      aria-label={label}
    />
  )
}
