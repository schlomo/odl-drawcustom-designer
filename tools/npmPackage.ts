import { APP_GITHUB_REPO_URL, APP_SLUG, APP_TAGLINE } from '../src/core/brand.ts'

/**
 * The npm package.json generated at PUBLISH STAGING TIME (issue #103) — the
 * tracked repo package.json stays pinned at `0.0.0` forever
 * (docs/releasing.md's version-source policy is unchanged); this is a
 * fresh, minimal object, not a derivative of the repo's own package.json, so
 * it never inherits `private: true` or the huge devDependencies/dependencies
 * lists. The published artifact is one self-contained ESM (React and every
 * other runtime dependency bundled in — vite.lib.config.ts, no code
 * splitting), so the published package.json intentionally has no
 * "dependencies"/"peerDependencies" — nothing for a consumer's package
 * manager to resolve.
 */

/**
 * The npm package moved under the `schlomo` npm **org** and is now scoped
 * (maintainer update, 2026-08-16 — mirrors the GitHub org/repo path). This
 * is deliberately its own constant, not `APP_SLUG` (ADR-014): `APP_SLUG` is
 * the unscoped product slug used for IndexedDB/localStorage/lint-source
 * naming across the whole app and must not change, while the npm package
 * name is purely a packaging concern. The ESM artifact filename
 * (`odl-drawcustom-designer.js`, `LIBRARY_FILE` below) is unaffected — only
 * the package.json `name` field is scoped.
 */
export const NPM_PACKAGE_NAME = `@schlomo/${APP_SLUG}` as const

const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/

export interface NpmPackageJson {
  name: string
  version: string
  description: string
  type: 'module'
  main: string
  exports: { '.': string }
  files: string[]
  license: string
  repository: { type: 'git'; url: string }
  homepage: string
  keywords: string[]
}

const LIBRARY_FILE = 'odl-drawcustom-designer.js'

/** APP_GITHUB_REPO_URL carries a trailing slash for use as a link target; strip it for git URLs. */
const REPO_URL_NO_TRAILING_SLASH = APP_GITHUB_REPO_URL.replace(/\/$/, '')

export function buildNpmPackageJson(version: string): NpmPackageJson {
  if (!PLAIN_SEMVER.test(version.trim())) {
    throw new Error(`Version "${version}" is not a plain X.Y.Z semver — cannot build package.json`)
  }
  return {
    name: NPM_PACKAGE_NAME,
    version,
    description: APP_TAGLINE,
    type: 'module',
    main: `./${LIBRARY_FILE}`,
    exports: { '.': `./${LIBRARY_FILE}` },
    files: [LIBRARY_FILE, 'LICENSE', 'NOTICE', 'THIRD_PARTY.md'],
    license: 'Apache-2.0',
    repository: { type: 'git', url: `git+${REPO_URL_NO_TRAILING_SLASH}.git` },
    homepage: APP_GITHUB_REPO_URL,
    keywords: [
      'home-assistant',
      'e-paper',
      'eink',
      'drawcustom',
      'opendisplay',
      'openepaperlink',
      'yaml-editor',
      'embeddable-designer',
    ],
  }
}
