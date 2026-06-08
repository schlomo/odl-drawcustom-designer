import { SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY } from './keys'

export function isShowcaseBundledSuppressed(): boolean {
  try {
    return localStorage.getItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function suppressShowcaseBundled(): void {
  try {
    localStorage.setItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY, '1')
  } catch {
    // ignore private mode / quota
  }
}

/** Re-enable the bundled demo image when loading the built-in showcase dashboard. */
export function allowShowcaseBundledForDemo(): void {
  try {
    localStorage.removeItem(SHOWCASE_BUNDLED_SUPPRESSED_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function shouldUseBundledShowcaseImage(key: string, bundledKey: string): boolean {
  return key === bundledKey && !isShowcaseBundledSuppressed()
}
