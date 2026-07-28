export interface AppVersionSource {
  vitest?: boolean
  packageVersion?: string
}

/**
 * Resolve the designer's runtime version label (issue #23). package.json's
 * `version` is the single source of truth, baked in at build time via a
 * `define` (see `tools/buildDefines.ts`) — mirrors the `vitest:` guard used
 * by `tools/gitRevision.ts` so the Vitest runtime never depends on
 * build-time state (AGENTS.md, "Build-time defines").
 */
export function resolveAppVersion(source: AppVersionSource = {}): string {
  if (source.vitest) {
    return 'test'
  }
  const version = source.packageVersion?.trim()
  return version && version.length > 0 ? version : '0.0.0'
}
