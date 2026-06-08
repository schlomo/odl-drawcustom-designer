import { TEMPLATE_PREVIEW_STORAGE_KEY } from './keys'

export function readTemplatePreviewEnabled(): boolean {
  try {
    const raw = localStorage.getItem(TEMPLATE_PREVIEW_STORAGE_KEY)
    if (raw === '0') {
      return false
    }
    if (raw === '1') {
      return true
    }
  } catch {
    // ignore private mode / quota
  }
  return true
}

export function writeTemplatePreviewEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TEMPLATE_PREVIEW_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}
