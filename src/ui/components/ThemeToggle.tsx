import { themeIconPath } from '../lib/mdi-tool-icons'
import { themeModeLabel, type ThemeMode } from '../preferences/theme'
import { IconButton } from './IconButton'

interface ThemeToggleProps {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  onCycle: () => void
}

export function ThemeToggle({ mode, resolvedTheme, onCycle }: ThemeToggleProps) {
  const detail =
    mode === 'system' ? `Using ${resolvedTheme} from system` : `Using ${resolvedTheme} theme`
  const label = `Theme: ${themeModeLabel(mode)}. ${detail}. Click to change.`

  const textLabel = themeModeLabel(mode)

  return (
    <IconButton
      iconPath={themeIconPath(mode)}
      label={textLabel}
      tooltip={textLabel}
      onClick={onCycle}
      title={label}
      aria-label={label}
    />
  )
}
