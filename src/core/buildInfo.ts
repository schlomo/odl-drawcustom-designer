import { APP_GITHUB_REPO_URL } from './brand'

const DEV_LABELS = new Set(['dev', 'test'])

/** Git branch baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_BRANCH =
  (import.meta.env.VITE_GIT_BRANCH ?? 'dev').trim() || 'dev'

/** Git revision baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_REVISION =
  (import.meta.env.VITE_GIT_REVISION ?? 'dev').trim() || 'dev'

/**
 * Merge-ref SHA baked in at build time (`vite.config.ts` / CI). On PR preview
 * builds this is GITHUB_SHA — the synthetic merge commit GitHub builds for
 * `pull_request` events, which exists on no branch. `APP_GIT_REVISION` shows
 * the PR head SHA instead (see ADR history / tools/gitRevision.ts); this
 * value is kept around so the header tooltip can still disclose it for
 * build honesty.
 */
export const APP_GIT_MERGE_REVISION =
  (import.meta.env.VITE_GIT_MERGE_REVISION ?? 'dev').trim() || 'dev'

/**
 * Pull-request number baked in at build time (`vite.config.ts` / CI).
 * `0` means this is not a PR preview build.
 */
export const APP_GIT_PR_NUMBER: number =
  Number(import.meta.env.VITE_GIT_PR_NUMBER ?? '0') || 0

/**
 * Optional HTML for a second header line (e.g. Impressum / Datenschutz links).
 * Set at build time via `VITE_HEADER_LEGAL_HTML`; trusted content only.
 */
export const APP_HEADER_LEGAL_HTML =
  (import.meta.env.VITE_HEADER_LEGAL_HTML ?? '').trim()

/**
 * Runtime version (issue #23, reworked 2026-07-29: git tags are the sole
 * version source, not package.json — see `tools/version.ts`). Baked in at
 * build time (`tools/buildDefines.ts`) from the release script's
 * `APP_VERSION` env var; a non-release build (local dev, CI `checks`) has
 * none set and falls back to `0.0.0-dev`. Re-exported from
 * `src/embed/index.ts` (`version`) and surfaced on `MountHandle.version`.
 */
export const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev').trim() || '0.0.0-dev'

/**
 * Production release-version label for the standalone site header — DISTINCT
 * from `APP_VERSION` above (the library's runtime version, always
 * `0.0.0-dev` outside a release build). Baked in at build time from
 * `SITE_VERSION`, set only by the `production` job in
 * `.github/workflows/pages.yml` via `tools/siteVersion.ts` (which reuses
 * `tools/autoRelease.ts`'s bump algorithm — docs/releasing.md#site-version).
 *
 * The empty string — every other build (local dev, CI `checks`, PR
 * previews, a local `build:site`) — is the deliberate "no site version"
 * signal, never a placeholder like `APP_VERSION` does. It does NOT by
 * itself mean the header falls back to branch + SHA: `APP_HEADER_VERSION`
 * below also consults `APP_VERSION`, so a released library build (empty
 * `APP_SITE_VERSION`, real `APP_VERSION`) still shows a version label —
 * only when *both* are unset/placeholder does the header fall back to
 * branch + SHA.
 */
export const APP_SITE_VERSION = (import.meta.env.VITE_SITE_VERSION ?? '').trim()

/** A bare `X.Y.Z` version, no leading `v`, no pre-release/build suffix. */
const RELEASED_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * True when `version` names an actual release rather than a placeholder —
 * `tools/version.ts`'s `DEV_APP_VERSION` (`'0.0.0-dev'`, fails the pattern
 * on its `-dev` suffix) or Vitest's short-circuited `'test'`. Exported so
 * `APP_HEADER_VERSION` below and its tests share one definition instead of
 * hardcoding placeholder strings twice.
 */
export function isReleasedVersion(version: string): boolean {
  return RELEASED_VERSION_PATTERN.test(version)
}

/**
 * Resolve the header's version label from the two independent version
 * signals above, in priority order. Exported as a pure function (mirrors
 * `tools/version.ts`'s `resolveAppVersion`/`resolveSiteVersion`) so the
 * priority itself is unit-testable without build-time defines; the module
 * constant below is what the UI actually imports.
 *
 *   1. `siteVersion` — the standalone Pages `production` job (unchanged).
 *   2. `appVersion` — when it's a real release, not the dev/test
 *      placeholder. This is what a **library build vendored into a host**
 *      (e.g. the HA panel embed) carries: `tools/autoRelease.ts` bakes the
 *      tag-derived version into `APP_VERSION` for every `build:lib`, but
 *      `SITE_VERSION` is set only by the standalone Pages job — so without
 *      this fallback an embedded designer had no version signal at all and
 *      the header fell back to branch + SHA, even though it knows its own
 *      release version perfectly well (issue: embedded header shows a SHA
 *      instead of the version upstream `main` shows).
 *   3. `''` — local dev, CI `checks`, PR previews: the header falls back to
 *      branch + SHA / `PR #n` exactly as before.
 *
 * Both sources name the SAME derived tag when both are set — one push
 * derives one version, reused for the GitHub release, the site, and the
 * library (`tools/autoRelease.ts`, `tools/siteVersion.ts`) — so a single
 * `githubReleaseUrl()` call is correct regardless of which source supplied
 * the label.
 */
export function resolveHeaderVersion(siteVersion: string, appVersion: string): string {
  if (siteVersion) {
    return siteVersion
  }
  return isReleasedVersion(appVersion) ? appVersion : ''
}

/**
 * The version label the header actually renders (`HeaderMetaRow.tsx`) — see
 * `resolveHeaderVersion` above for the priority. `''` means "show branch +
 * SHA / PR # instead", same contract `APP_SITE_VERSION` used to carry alone.
 */
export const APP_HEADER_VERSION = resolveHeaderVersion(APP_SITE_VERSION, APP_VERSION)

/** Compact branch label for the header (leaf segment, truncated when long). */
export function formatGitBranchLabel(branch: string, maxLen = 12): string {
  if (DEV_LABELS.has(branch) || branch.length <= maxLen) {
    return branch
  }
  const leaf = branch.includes('/') ? branch.slice(branch.lastIndexOf('/') + 1) : branch
  if (leaf.length <= maxLen) {
    return leaf
  }
  return `${leaf.slice(0, maxLen - 1)}…`
}

/** Compact revision label for the header (7-char SHA when applicable). */
export function formatGitRevisionLabel(revision: string): string {
  if (DEV_LABELS.has(revision) || revision.length <= 7) {
    return revision
  }
  if (/^[0-9a-f]+$/i.test(revision)) {
    return revision.slice(0, 7)
  }
  return revision.length > 12 ? `${revision.slice(0, 11)}…` : revision
}

/**
 * Tooltip text for the revision link. Shows only the displayed revision
 * (the PR head SHA on preview builds), plus the merge SHA when it differs
 * and isn't a dev/test placeholder — build honesty without confusing the
 * primary label.
 */
export function formatRevisionTooltip(
  revision = APP_GIT_REVISION,
  mergeRevision = APP_GIT_MERGE_REVISION,
): string {
  if (mergeRevision === revision || DEV_LABELS.has(mergeRevision)) {
    return `Revision: ${revision}`
  }
  return `Revision: ${revision} · built from merge ${formatGitRevisionLabel(mergeRevision)}`
}

/** Link to the branch tree (or PR page for PR preview builds, or `main` history for local dev). */
export function githubBranchUrl(branch = APP_GIT_BRANCH, prNumber = APP_GIT_PR_NUMBER): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  if (DEV_LABELS.has(branch)) {
    return `${repoBase}/commits/main`
  }
  if (prNumber > 0) {
    return `${repoBase}/pull/${prNumber}`
  }
  return `${repoBase}/tree/${encodeURIComponent(branch)}`
}

/** Link to the commit this build was produced from (or `main` for local dev). */
export function githubCommitUrl(revision = APP_GIT_REVISION): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  if (DEV_LABELS.has(revision)) {
    return `${repoBase}/commits/main`
  }
  return `${repoBase}/commit/${revision}`
}

/** Link to a release's GitHub release page (`version` is a plain `X.Y.Z`, no leading `v`). */
export function githubReleaseUrl(version = APP_SITE_VERSION): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  return `${repoBase}/releases/tag/v${version}`
}
