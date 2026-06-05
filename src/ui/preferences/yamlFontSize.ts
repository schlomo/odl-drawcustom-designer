import { YAML_FONT_SIZE_STORAGE_KEY } from './keys'

export const YAML_FONT_SIZE_MIN = 10
export const YAML_FONT_SIZE_MAX = 24
export const YAML_FONT_SIZE_DEFAULT = 13
export const YAML_FONT_SIZE_STEP = 1

export function clampYamlFontSize(size: number): number {
  return Math.min(YAML_FONT_SIZE_MAX, Math.max(YAML_FONT_SIZE_MIN, Math.round(size)))
}

export function readYamlFontSize(): number {
  try {
    const stored = localStorage.getItem(YAML_FONT_SIZE_STORAGE_KEY)
    if (!stored) {
      return YAML_FONT_SIZE_DEFAULT
    }
    const parsed = Number(stored)
    if (Number.isFinite(parsed)) {
      return clampYamlFontSize(parsed)
    }
  } catch {
    // ignore
  }
  return YAML_FONT_SIZE_DEFAULT
}

export function writeYamlFontSize(size: number): void {
  localStorage.setItem(YAML_FONT_SIZE_STORAGE_KEY, String(clampYamlFontSize(size)))
}

export function stepYamlFontSize(current: number, direction: -1 | 1): number {
  return clampYamlFontSize(current + direction * YAML_FONT_SIZE_STEP)
}
