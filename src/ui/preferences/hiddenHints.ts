import { SHOW_HIDDEN_HINTS_STORAGE_KEY } from './keys'

export interface ShowHiddenHintsPrefs {
  enabled: boolean
}

export const DEFAULT_SHOW_HIDDEN_HINTS: ShowHiddenHintsPrefs = {
  enabled: true,
}

export function readShowHiddenHintsPrefs(): ShowHiddenHintsPrefs {
  try {
    const raw = localStorage.getItem(SHOW_HIDDEN_HINTS_STORAGE_KEY)
    if (raw === '0') {
      return { enabled: false }
    }
    if (raw === '1') {
      return { enabled: true }
    }
  } catch {
    // ignore private mode / quota
  }
  return DEFAULT_SHOW_HIDDEN_HINTS
}

export function writeShowHiddenHintsPrefs(prefs: ShowHiddenHintsPrefs): void {
  try {
    localStorage.setItem(SHOW_HIDDEN_HINTS_STORAGE_KEY, prefs.enabled ? '1' : '0')
  } catch {
    // ignore
  }
}
