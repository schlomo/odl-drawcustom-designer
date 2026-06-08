import { fontFamilyNameForKey } from '../../core/renderer/font-family-name'

export function resolveSvgFontFamily(
  fontKey: string | undefined,
  fontFamilies: ReadonlyMap<string, string>,
): string {
  if (!fontKey) {
    return 'sans-serif'
  }
  const family = fontFamilies.get(fontKey) ?? fontFamilyNameForKey(fontKey)
  return `${family}, sans-serif`
}

export function clampStrokeWidth(width: number | undefined): number {
  return Math.max(0, width ?? 0)
}
