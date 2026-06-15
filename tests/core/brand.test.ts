import { describe, expect, it } from 'vitest'
import {
  APP_GITHUB_REPO_URL,
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

describe('brand constants', () => {
  it('exports the odl-drawcustom-designer product identity', () => {
    expect(APP_SLUG).toBe('odl-drawcustom-designer')
    expect(APP_TITLE).toBe('ODL/OEPL Drawcustom Designer')
    expect(APP_TAGLINE).toBe(
      'Visual editor for OpenDisplay Language YAML — Home Assistant drawcustom compatible.',
    )
    expect(INDEXEDDB_NAME).toBe(APP_SLUG)
    expect(SHOWCASE_DEMO_TITLE).toBe('ODL/OEPL drawcustom Showcase')
    expect(FONT_FAMILY_PREFIX).toBe('drawcustom-font')
    expect(YAML_LINT_SOURCE).toBe('odl-drawcustom-designer-yaml')
    expect(APP_GITHUB_REPO_URL).toBe('https://github.com/schlomo/odl-drawcustom-designer/')
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
