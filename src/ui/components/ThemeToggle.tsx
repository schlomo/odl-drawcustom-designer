import { themeIconPath } from '../lib/mdi-tool-icons'
import { themeModeLabel, type ThemeMode } from '../preferences/theme'
import { IconButton } from './IconButton'
import { shell } from '../styles/shell'

interface ThemeToggleProps {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  onCycle: () => void
}

export function ThemeToggle({ mode, resolvedTheme, onCycle }: ThemeToggleProps) {
  const detail =
    mode === 'system' ? `Using ${resolvedTheme} from system` : `Using ${resolvedTheme} theme`
  const label = `Theme: ${themeModeLabel(mode)}. ${detail}. Click to change.`

  return (
    <IconButton
      iconPath={themeIconPath(mode)}
      compact
      className={shell.button}
      onClick={onCycle}
      title={label}
      aria-label={label}
    />
  )
}
