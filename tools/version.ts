export interface AppVersionSource {
  vitest?: boolean
  envVersion?: string
}

/** Non-release build label (local dev, CI `checks`) — no release in progress. */
export const DEV_APP_VERSION = '0.0.0-dev'

/**
 * Resolve the designer's runtime version label (issue #23, reworked
 * 2026-07-29: git tags are the sole version source — package.json stays
 * pinned at `0.0.0` forever). The release script (`tools/autoRelease.ts`)
 * sets an env var (`APP_VERSION`) for the library build it triggers; baked
 * in here at build time via a `define` (see `tools/buildDefines.ts`) —
 * mirrors the `vitest:` guard used by `tools/gitRevision.ts` so the Vitest
 * runtime never depends on build-time state (AGENTS.md, "Build-time
 * defines"). A non-release build has no `APP_VERSION` set; falling back to
 * `DEV_APP_VERSION` here is the one documented silent fallback (AGENTS.md,
 * "fail loudly" exception) — everything else in the release path fails loud.
 */
export function resolveAppVersion(source: AppVersionSource = {}): string {
  if (source.vitest) {
    return 'test'
  }
  const version = source.envVersion?.trim()
  return version && version.length > 0 ? version : DEV_APP_VERSION
}

/**
 * Resolve the standalone site header's release-version label. Set only by
 * the `production` job in `.github/workflows/pages.yml`, from
 * `tools/siteVersion.ts` (which reuses `tools/autoRelease.ts`'s bump
 * algorithm — see docs/releasing.md#site-version).
 *
 * Unlike `resolveAppVersion` above, an unset/blank source degrades to the
 * **empty string**, never a placeholder: every other build (local dev,
 * `checks`, PR previews, a local `build:site`) has no `SITE_VERSION` set,
 * and the header must omit the version entirely rather than show
 * `0.0.0-dev` or any other stand-in — the whole point is never showing a
 * label that might be wrong.
 */
export function resolveSiteVersion(source: AppVersionSource = {}): string {
  if (source.vitest) {
    return ''
  }
  return source.envVersion?.trim() ?? ''
}
