export interface AppVersionSource {
  vitest?: boolean
  envVersion?: string
}

/** Non-release build label (local dev, CI `checks`) — no release in progress. */
export const DEV_APP_VERSION = '0.0.0-dev'

/**
 * Resolve the designer's runtime version label (issue #23, reworked
 * 2026-07-29: git tags are the sole version source — package.json stays
 * pinned at `0.0.0` forever). This is the project's ONE version define
 * (reworked 2026-09-01): the release pipeline computes the version once and
 * every build in that run — the library and the standalone site alike —
 * bakes this same value (docs/releasing.md). The workflow sets `APP_VERSION`
 * in the environment; it is baked in here at build time via a `define` (see
 * `tools/buildDefines.ts`) — mirroring the `vitest:` guard used by
 * `tools/gitRevision.ts` so the Vitest runtime never depends on build-time
 * state (AGENTS.md, "Build-time defines"). A non-release build (local dev,
 * CI `checks`, a PR preview) has no `APP_VERSION` set; falling back to
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
