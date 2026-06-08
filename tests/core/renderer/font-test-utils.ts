import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearFontRegistry, parseFont, registerFont } from '../../../src/core/renderer/fonts'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

export function bundledFontPath(key: string): string {
  return join(fixtureRoot, 'public/fonts', key)
}

export function loadBundledTestFont(key = 'ppb.ttf') {
  const buffer = readFileSync(bundledFontPath(key))
  const font = parseFont(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  registerFont(key, font)
  return font
}

export function resetTestFonts(): void {
  clearFontRegistry()
}
