import bidiFactory from 'bidi-js'

const bidi = bidiFactory()

/** Reorder logical text to visual left-to-right order (Unicode Bidirectional Algorithm). */
export function toVisualText(text: string): string {
  if (!text) {
    return text
  }

  return bidi.getReorderedString(text, bidi.getEmbeddingLevels(text))
}

export function getDominantTextDirection(text: string): 'ltr' | 'rtl' {
  if (!text.trim()) {
    return 'ltr'
  }

  const embedding = bidi.getEmbeddingLevels(text)
  const paragraphLevel = embedding.paragraphs[0]?.level ?? 0
  return paragraphLevel & 1 ? 'rtl' : 'ltr'
}
