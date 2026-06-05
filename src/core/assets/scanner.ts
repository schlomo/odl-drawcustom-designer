import type { DrawElement } from '../schema/elements'
import { hasTemplateSyntax } from '../templates/patterns'
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
