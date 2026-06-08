import type opentype from 'opentype.js'
import type { DrawElement } from '../schema/elements'
import { hasTemplateSyntax } from '../templates/patterns'
import { effectiveString } from './element-defaults'
import { DEFAULT_FONT_KEY, getFont } from './fonts'

export interface GlyphCoverageIssue {
  fontKey: string
  elementIndex: number
  elementType: 'text' | 'multiline'
  missingCharacters: string[]
  textPreview: string
}

const PREVIEW_MAX_LENGTH = 32

/** Characters that do not require a dedicated glyph in the font. */
export function isIgnorableCharacter(char: string): boolean {
  return /\s/u.test(char)
}

export function findMissingCharacters(font: opentype.Font, text: string): string[] {
  const missing: string[] = []
  const seen = new Set<string>()

  for (const char of text) {
    if (isIgnorableCharacter(char) || seen.has(char)) {
      continue
    }
    if (!font.hasChar(char)) {
      seen.add(char)
      missing.push(char)
    }
  }

  return missing
}

export function formatMissingCharacterSample(characters: readonly string[], limit = 5): string {
  if (characters.length === 0) {
    return ''
  }

  const shown = characters.slice(0, limit)
  const label = shown.join(', ')
  return characters.length > limit ? `${label}, …` : label
}

function previewText(text: string): string {
  const compact = text.replace(/\s+/gu, ' ').trim()
  if (compact.length <= PREVIEW_MAX_LENGTH) {
    return compact
  }
  return `${compact.slice(0, PREVIEW_MAX_LENGTH)}…`
}

function textSamplesForElement(
  element: DrawElement,
): { fontKey: string; elementType: 'text' | 'multiline'; texts: string[] } | null {
  if (element.type === 'text') {
    const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
    if (hasTemplateSyntax(fontKey)) {
      return null
    }
    return { fontKey, elementType: 'text', texts: [element.value] }
  }

  if (element.type === 'multiline') {
    const fontKey = effectiveString(element, 'font', DEFAULT_FONT_KEY)
    if (hasTemplateSyntax(fontKey)) {
      return null
    }
    return { fontKey, elementType: 'multiline', texts: element.value.split(element.delimiter) }
  }

  return null
}

export function scanGlyphCoverageIssues(
  elements: readonly DrawElement[],
  resolveFont: (fontKey: string) => opentype.Font | undefined = getFont,
): GlyphCoverageIssue[] {
  const issues: GlyphCoverageIssue[] = []

  elements.forEach((element, elementIndex) => {
    const sample = textSamplesForElement(element)
    if (!sample) {
      return
    }

    const font = resolveFont(sample.fontKey)
    if (!font) {
      return
    }

    const missingCharacters = new Set<string>()
    const textParts: string[] = []

    for (const text of sample.texts) {
      if (!text) {
        continue
      }
      textParts.push(text)
      for (const char of findMissingCharacters(font, text)) {
        missingCharacters.add(char)
      }
    }

    if (missingCharacters.size === 0) {
      return
    }

    issues.push({
      fontKey: sample.fontKey,
      elementIndex,
      elementType: sample.elementType,
      missingCharacters: [...missingCharacters],
      textPreview: previewText(textParts.join(' | ')),
    })
  })

  return issues
}
