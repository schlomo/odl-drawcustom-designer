import { getFont } from '../../core'

export function isFontReadyForLayout(
  key: string,
  loadedFonts: ReadonlyMap<string, unknown>,
): boolean {
  return loadedFonts.has(key) || getFont(key) != null
}

/** Changes when async font registration completes so text anchor layout can re-run. */
export function fontLayoutTokenForKeys(
  keys: readonly string[],
  loadedFonts: ReadonlyMap<string, unknown>,
): string {
  if (keys.length === 0) {
    return 'none'
  }
  return keys
    .map((key) => `${key}:${isFontReadyForLayout(key, loadedFonts) ? '1' : '0'}`)
    .join('|')
}
