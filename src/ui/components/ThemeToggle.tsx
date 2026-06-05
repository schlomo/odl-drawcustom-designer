import { themeModeLabel, type ThemeMode } from '../preferences/theme'
import { shell } from '../styles/shell'

interface ThemeToggleProps {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  onCycle: () => void
}

export function ThemeToggle({ mode, resolvedTheme, onCycle }: ThemeToggleProps) {
  const detail =
    mode === 'system' ? `Using ${resolvedTheme} from system` : `Using ${resolvedTheme} theme`

  return (
    <button
      type="button"
      className={shell.button}
      onClick={onCycle}
      title={detail}
      aria-label={`Theme: ${themeModeLabel(mode)}. ${detail}. Click to change.`}
    >
      {themeModeLabel(mode)}
      {mode === 'system' ? ` (${resolvedTheme})` : ''}
    </button>
  )
}
