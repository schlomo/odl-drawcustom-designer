import { FONT_FAMILY_PREFIX } from '../brand'

/** CSS @font-face family name for a YAML font key (matches ui FontFace registration). */
export function fontFamilyNameForKey(key: string): string {
  const slug = key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${FONT_FAMILY_PREFIX}-${slug || 'default'}`
}
