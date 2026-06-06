import { BUNDLED_FONT_KEYS, scanPayloadForAssets, type DrawElement } from '../../core'

export const FONT_UPLOAD_OPTION = '__upload_font__'

export function collectKnownFontKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>(BUNDLED_FONT_KEYS)

  for (const ref of scanPayloadForAssets([...elements]).references) {
    if (ref.kind === 'font') {
      keys.add(ref.key)
    }
  }

  for (const element of elements) {
    if ('font' in element && typeof element.font === 'string' && element.font) {
      keys.add(element.font)
    }
  }

  return [...keys].sort()
}
