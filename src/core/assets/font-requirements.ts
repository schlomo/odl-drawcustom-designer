import type { DrawElement } from '../schema/elements'
import { DEFAULT_FONT_KEY } from '../renderer/fonts'
import { hasTemplateSyntax } from '../templates/patterns'

const FONT_ELEMENT_TYPES = new Set<DrawElement['type']>([
  'debug_grid',
  'text',
  'multiline',
  'plot',
  'progress_bar',
])

export interface FontReference {
  key: string
  elementIndex: number
  elementType: DrawElement['type']
  templated: boolean
}

function elementUsesFont(element: DrawElement): element is DrawElement & { font?: string } {
  return FONT_ELEMENT_TYPES.has(element.type)
}

function fontKeyForElement(element: DrawElement & { font?: string }): string {
  return element.font ?? DEFAULT_FONT_KEY
}

/** Every font key referenced by drawable elements, including templated values. */
export function scanFontReferences(elements: readonly DrawElement[]): FontReference[] {
  const references: FontReference[] = []

  elements.forEach((element, elementIndex) => {
    if (!elementUsesFont(element)) {
      return
    }

    const key = fontKeyForElement(element)
    if (!key) {
      return
    }

    references.push({
      key,
      elementIndex,
      elementType: element.type,
      templated: hasTemplateSyntax(key),
    })
  })

  return references
}

/** Static font keys that must be loaded for accurate preview metrics. */
export function collectRequiredFontKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()

  for (const reference of scanFontReferences(elements)) {
    if (!reference.templated) {
      keys.add(reference.key)
    }
  }

  return [...keys].sort()
}

/** Templated font expressions that cannot be resolved at preview time. */
export function collectTemplatedFontKeys(elements: readonly DrawElement[]): string[] {
  const keys = new Set<string>()

  for (const reference of scanFontReferences(elements)) {
    if (reference.templated) {
      keys.add(reference.key)
    }
  }

  return [...keys].sort()
}
