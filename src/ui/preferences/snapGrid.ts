import { SNAP_GRID_STORAGE_KEY } from './keys'

export interface SnapGridPrefs {
  enabled: boolean
  size: number
}

const DEFAULT_PREFS: SnapGridPrefs = {
  enabled: true,
  size: 10,
}

export function readSnapGridPrefs(): SnapGridPrefs {
  try {
    const raw = localStorage.getItem(SNAP_GRID_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PREFS
    }
    const parsed = JSON.parse(raw) as Partial<SnapGridPrefs>
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
      size: typeof parsed.size === 'number' && parsed.size > 0 ? parsed.size : DEFAULT_PREFS.size,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writeSnapGridPrefs(prefs: SnapGridPrefs): void {
  localStorage.setItem(SNAP_GRID_STORAGE_KEY, JSON.stringify(prefs))
}
