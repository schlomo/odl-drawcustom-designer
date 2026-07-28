import { readFileSync } from 'node:fs'

/**
 * Tag-driven release validation (issue #23). The release workflow
 * (`.github/workflows/release.yml`) pushes a `vX.Y.Z` tag; this is the only
 * validation logic for that path — thin CI (AGENTS.md): the workflow just
 * calls this script, everything testable lives here.
 */

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/

/** Extract the semver from a release tag. Throws on any tag that isn't exactly `vX.Y.Z`. */
export function versionFromTag(tag: string): string {
  const match = TAG_PATTERN.exec(tag.trim())
  if (!match) {
    throw new Error(`Release tag "${tag}" must match vX.Y.Z (e.g. v1.2.3) — no pre-release/build suffixes`)
  }
  return match[1]!
}

export interface TagVersionCheck {
  tag: string
  packageVersion: string
}

/**
 * Fail loudly when the pushed tag doesn't match package.json's version. The
 * tag is what the release artifact's baked-in `version` (tools/version.ts)
 * will show hosts — a mismatch means the artifact would misreport itself.
 */
export function assertTagMatchesPackageVersion({ tag, packageVersion }: TagVersionCheck): void {
  const tagVersion = versionFromTag(tag)
  const normalizedPackageVersion = packageVersion.trim()
  if (tagVersion !== normalizedPackageVersion) {
    throw new Error(
      `Tag ${tag} (version ${tagVersion}) does not match package.json version ` +
        `${normalizedPackageVersion} — bump package.json to match before tagging (docs/releasing.md)`,
    )
  }
}

if (import.meta.main) {
  const tag = process.argv[2]
  if (!tag) {
    console.error('Usage: node tools/releaseVersion.ts <tag>')
    process.exit(1)
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  assertTagMatchesPackageVersion({ tag, packageVersion: pkg.version })
  console.log(`OK: tag ${tag} matches package.json version ${pkg.version}`)
}
