import { useCallback, useEffect, useState } from 'react'
import {
  nextThemeMode,
  readThemeMode,
  resolveThemeMode,
  writeThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from '../preferences/theme'

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
}

export interface ThemePreferenceOptions {
  /**
   * Standalone mode applies the resolved theme to `document.documentElement`.
   * Embedded mounts pass `false`: the host page's globals are not ours to
   * touch — the mount container carries the theme instead (issue #20).
   */
  applyToDocument?: boolean
}

export function useThemePreference({ applyToDocument = true }: ThemePreferenceOptions = {}) {
  const [mode, setMode] = useState<ThemeMode>(() => readThemeMode())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark())
  const resolvedTheme = resolveThemeMode(mode, systemPrefersDark)

  useEffect(() => {
    if (!applyToDocument) {
      return
    }
    applyResolvedTheme(resolvedTheme)
  }, [applyToDocument, resolvedTheme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const cycleMode = useCallback(() => {
    setMode((current) => {
      const next = nextThemeMode(current)
      writeThemeMode(next)
      return next
    })
  }, [])

  const setThemeMode = useCallback((next: ThemeMode) => {
    writeThemeMode(next)
    setMode(next)
  }, [])

  return {
    mode,
    resolvedTheme,
    systemPrefersDark,
    cycleMode,
    setThemeMode,
  }
}
