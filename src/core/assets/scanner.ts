import type { DrawElement } from '../schema/elements'
import { hasTemplateSyntax } from '../templates/patterns'
import { isDataUrl } from './data-url'
import type { AssetKind, AssetReference, AssetScanResult, Payload } from './types'

const FONT_ELEMENT_TYPES = new Set<DrawElement['type']>([
  'debug_grid',
  'text',
  'multiline',
  'plot',
  'progress_bar',
])

function addReference(
  references: AssetReference[],
  path: string,
  key: string,
  kind: AssetKind,
): void {
  if (!key || hasTemplateSyntax(key)) {
    return
  }
  // A `data:` image URL is the image itself — nothing to upload, resolve or
  // warn about. Fonts are deliberately not covered: a font name is a lookup
  // key whatever it starts with, and that path is unchanged.
  if (kind === 'image' && isDataUrl(key)) {
    return
  }

  references.push({ path, key, kind })
}

export function scanPayloadForAssets(payload: Payload): AssetScanResult {
  const references: AssetReference[] = []

  payload.forEach((element, index) => {
    const basePath = `[${index}]`

    if (element.type === 'dlimg') {
      addReference(references, `${basePath}.url`, element.url, 'image')
      return
    }

    if (FONT_ELEMENT_TYPES.has(element.type) && 'font' in element && element.font) {
      addReference(references, `${basePath}.font`, element.font, 'font')
    }
  })

  const keys = [...new Set(references.map((ref) => ref.key))].sort()

  return { references, keys }
}
