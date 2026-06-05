import { THEME_MODE_STORAGE_KEY } from './keys'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_MODE_ORDER: ThemeMode[] = ['system', 'light', 'dark']

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (isThemeMode(stored)) {
      return stored
    }
  } catch {
    // ignore
  }
  return 'system'
}

export function writeThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_MODE_STORAGE_KEY, mode)
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light'
  }
  return mode
}

export function themeModeLabel(mode: ThemeMode): string {
  switch (mode) {
    case 'system':
      return 'System'
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
  }
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODE_ORDER.indexOf(mode)
  return THEME_MODE_ORDER[(index + 1) % THEME_MODE_ORDER.length] ?? 'system'
}
