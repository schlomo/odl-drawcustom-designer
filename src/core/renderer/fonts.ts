import opentype from 'opentype.js'

/** Default bundled font per docs/spec/supported_types.md */
export const DEFAULT_FONT_KEY = 'ppb.ttf'

const registry = new Map<string, opentype.Font>()

export function registerFont(key: string, font: opentype.Font): void {
  registry.set(key, font)
}

export function unregisterFont(key: string): void {
  registry.delete(key)
}

export function clearFontRegistry(): void {
  registry.clear()
}

export function getFont(key: string | undefined): opentype.Font | undefined {
  const resolvedKey = key ?? DEFAULT_FONT_KEY
  return registry.get(resolvedKey)
}

export function parseFont(buffer: ArrayBuffer): opentype.Font {
  return opentype.parse(buffer)
}
