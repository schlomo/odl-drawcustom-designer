import { describe, expect, it } from 'vitest'
import {
  APP_GITHUB_REPO_URL,
  APP_PRIVACY_HEADLINE,
  APP_PRIVACY_NOTE,
  APP_SLUG,
  APP_TAGLINE,
  APP_TITLE,
  FONT_FAMILY_PREFIX,
  INDEXEDDB_NAME,
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
    expect(APP_PRIVACY_NOTE).toBe(
      'Client-side only — local storage and URL hash share links; nothing sent to a server.',
    )
    expect(APP_PRIVACY_HEADLINE).toBe('Client-side processing only')
    expect(INDEXEDDB_NAME).toBe(APP_SLUG)
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
