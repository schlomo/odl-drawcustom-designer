import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_SLUG,
  APP_TAGLINE,
  APP_TITLE,
  FONT_FAMILY_PREFIX,
  INDEXEDDB_NAME,
  SHOWCASE_DEMO_TITLE,
  YAML_LINT_SOURCE,
  fontUploadVerifyFamily,
  storageKey,
} from '../../src/core/brand'

const REPO_ROOT = join(import.meta.dirname, '../..')

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkSourceFiles(fullPath)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      yield fullPath
    }
  }
}

function collectForbiddenLiterals(): string[] {
  const violations: string[] = []
  const oeplPrefixPattern = /['"`]oepl-[\w-]+['"`]/

  for (const scanDir of ['src', 'tests'] as const) {
    for (const filePath of walkSourceFiles(join(REPO_ROOT, scanDir))) {
      const relPath = relative(REPO_ROOT, filePath).replaceAll('\\', '/')
      if (relPath === 'src/core/brand.ts' || relPath === 'tests/core/brand.test.ts') {
        continue
      }
      const content = readFileSync(filePath, 'utf8')
      if (content.includes('oepl-designer')) {
        violations.push(`${relPath}: contains "oepl-designer"`)
      }
      if (oeplPrefixPattern.test(content)) {
        violations.push(`${relPath}: contains oepl- storage/IndexedDB literal`)
      }
    }
  }

  return violations
}

describe('brand constants', () => {
  it('exports the odl-drawcustom-designer product identity', () => {
    expect(APP_SLUG).toBe('odl-drawcustom-designer')
    expect(APP_TITLE).toBe('ODL Drawcustom Designer')
    expect(APP_TAGLINE).toBe(
      'Visual editor for OpenDisplay Language YAML — Home Assistant drawcustom compatible.',
    )
    expect(INDEXEDDB_NAME).toBe(APP_SLUG)
    expect(SHOWCASE_DEMO_TITLE).toBe('ODL drawcustom Showcase')
    expect(FONT_FAMILY_PREFIX).toBe('drawcustom-font')
    expect(YAML_LINT_SOURCE).toBe('odl-drawcustom-designer-yaml')
  })

  it('builds storage keys from the app slug', () => {
    expect(storageKey('theme-mode')).toBe('odl-drawcustom-designer-theme-mode')
  })

  it('returns unique font upload probe families', () => {
    const first = fontUploadVerifyFamily()
    const second = fontUploadVerifyFamily()
    expect(first).toMatch(/^drawcustom-font-upload-verify-\d+$/)
    expect(second).not.toBe(first)
  })
})

describe('brand naming sweep', () => {
  it('has no oepl-designer or oepl- storage literals outside brand.ts', () => {
    expect(collectForbiddenLiterals()).toEqual([])
  })
})
