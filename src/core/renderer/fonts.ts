import opentype from 'opentype.js'

/** Default bundled font per docs/spec/supported_types.md */
export const DEFAULT_FONT_KEY = 'ppb.ttf'

const registry = new Map<string, opentype.Font>()

/**
 * Fonts confirmed unavailable (no matching content-map asset, or a load/parse
 * failure) — keyed message explains why. Deliberately separate from
 * `registry`'s absence: "not registered yet" also covers the ordinary
 * transient window while a font is still loading, which must NOT be treated
 * as an error (issue #53). Only an explicit entry here means "confirmed
 * missing/failed", set by the UI's font loader once its async resolution
 * settles either way.
 */
const unavailable = new Map<string, string>()

export function registerFont(key: string, font: opentype.Font): void {
  registry.set(key, font)
  unavailable.delete(key)
}

export function unregisterFont(key: string): void {
  registry.delete(key)
}

export function clearFontRegistry(): void {
  registry.clear()
  unavailable.clear()
}

export function getFont(key: string | undefined): opentype.Font | undefined {
  const resolvedKey = key ?? DEFAULT_FONT_KEY
  return registry.get(resolvedKey)
}

/**
 * Mark a font key as confirmed unavailable (missing from the content map, or
 * failed to fetch/parse). Renderers check this when `getFont` returns
 * undefined to distinguish "definitely won't arrive" from "still loading" —
 * see `renderText`/`renderMultiline`.
 */
export function markFontUnavailable(key: string, message: string): void {
  unavailable.set(key, message)
}

export function clearFontUnavailable(key: string): void {
  unavailable.delete(key)
}

export function fontUnavailableMessage(key: string | undefined): string | undefined {
  const resolvedKey = key ?? DEFAULT_FONT_KEY
  return unavailable.get(resolvedKey)
}

export function parseFont(buffer: ArrayBuffer): opentype.Font {
  return opentype.parse(buffer)
}
