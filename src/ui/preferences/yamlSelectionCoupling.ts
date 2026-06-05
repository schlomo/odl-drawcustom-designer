export const YAML_SELECTION_COUPLING_STORAGE_KEY = 'oepl-yaml-selection-coupling'

export function readYamlSelectionCoupling(): boolean {
  try {
    const stored = localStorage.getItem(YAML_SELECTION_COUPLING_STORAGE_KEY)
    if (stored === 'false') {
      return false
    }
    if (stored === 'true') {
      return true
    }
  } catch {
    // ignore
  }
  return true
}

export function writeYamlSelectionCoupling(enabled: boolean): void {
  localStorage.setItem(YAML_SELECTION_COUPLING_STORAGE_KEY, String(enabled))
}
