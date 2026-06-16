/** Product identity — single source of truth (ADR-014). */

export const APP_SLUG = 'odl-drawcustom-designer' as const

export const APP_TITLE = 'ODL/OEPL Drawcustom Designer' as const

export const APP_TAGLINE =
  'Visual editor for OpenDisplay Language YAML — Home Assistant drawcustom compatible.' as const

/** Full privacy / hosting explanation (README, header tooltip). */
export const APP_PRIVACY_NOTE =
  'Client-side only — local storage and URL hash share links; nothing sent to a server.' as const

/** Short label in the app header; details in {@link APP_PRIVACY_NOTE} tooltip. */
export const APP_PRIVACY_HEADLINE = 'Client-side processing only' as const

/** Public GitHub repository URL (showcase QR, header logo link). */
export const APP_GITHUB_REPO_URL =
  'https://github.com/schlomo/odl-drawcustom-designer/' as const

export const INDEXEDDB_NAME = APP_SLUG

export const SHOWCASE_DEMO_TITLE = 'ODL/OEPL drawcustom Showcase' as const

export const FONT_FAMILY_PREFIX = 'drawcustom-font' as const

export const YAML_LINT_SOURCE = `${APP_SLUG}-yaml` as const

let fontUploadVerifyCounter = 0

/** Unique @font-face family for upload verification probes (not persisted). */
export function fontUploadVerifyFamily(): string {
  fontUploadVerifyCounter += 1
  return `${FONT_FAMILY_PREFIX}-upload-verify-${fontUploadVerifyCounter}`
}

export function storageKey(suffix: string): string {
  return `${APP_SLUG}-${suffix}`
}
