import { listLibraryFontKeys, scanPayloadForAssets, type DrawElement } from '../../core'
import { hasTemplateSyntax } from '../../core/templates/patterns'

export const FONT_UPLOAD_OPTION = '__upload_font__'

/**
 * Font keys for property dropdowns: bundled, uploaded library, and any path
 * referenced in the payload (even when not uploaded yet).
 */
export function collectKnownFontKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>(listLibraryFontKeys())

  for (const ref of scanPayloadForAssets([...elements]).references) {
    if (ref.kind === 'font') {
      keys.add(ref.key)
    }
  }

  for (const element of elements) {
    if ('font' in element && typeof element.font === 'string' && element.font) {
      if (!hasTemplateSyntax(element.font)) {
        keys.add(element.font)
      }
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b))
}
