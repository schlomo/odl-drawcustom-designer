/**
 * Recovery for a partial-failure gap in the npm publish rollout (issue #113
 * review finding on #103's PR): `gh release create` is irreversible — it
 * creates the `vX.Y.Z` tag AND the release in one step — but `npm publish`
 * runs after it. If the publish step fails (or the job is killed) after the
 * release already exists, the *next* run derives `latestTag` = the tag that
 * publish just failed for, sees zero commits since it, and takes the normal
 * "nothing to release" skip path — which, unpatched, exits 0 and never
 * revisits that version. That version would never reach npm.
 *
 * Fix (AGENTS.md, "re-running is the upgrade path"): the skip path in
 * tools/autoRelease.ts asks this module whether the latest tag's version is
 * actually on the npm registry, and if not, recovers it — rebuild with
 * `APP_VERSION=<that version>`, stage, publish, log clearly. The decision is
 * a pure, synchronous function (`planNpmRecovery`) so it is unit-tested
 * without mocking network; the actual read-only registry lookup
 * (`checkNpmRegistryHasVersion`) is a separate async function that
 * distinguishes "not published" (404) from any other failure (network down,
 * 5xx) — a registry outage must fail loudly, not be silently read as "not
 * published" (AGENTS.md, "fail early and loudly").
 */

const PLAIN_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Compares two plain `X.Y.Z` semver strings numerically per segment (never
 * lexicographically — "1.9.0" must sort before "1.10.0"). Returns
 * negative/zero/positive like an `Array#sort` comparator.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = PLAIN_SEMVER.exec(a.trim())
  const partsB = PLAIN_SEMVER.exec(b.trim())
  if (!partsA) {
    throw new Error(`Version "${a}" is not a plain X.Y.Z semver`)
  }
  if (!partsB) {
    throw new Error(`Version "${b}" is not a plain X.Y.Z semver`)
  }
  for (let index = 1; index <= 3; index += 1) {
    const diff = Number(partsA[index]) - Number(partsB[index])
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

/**
 * Cutoff below which recovery must never fire. v1.0.0–v1.0.4 were released
 * before npm publishing existed at all (issue #103 added it) — those GitHub
 * releases carry no npm-related assets and were never meant to reach npm, so
 * a later skip run must not retroactively publish them. This PR's own
 * feat-scoped release is the first version that CAN carry an npm publish;
 * since the latest tag at the time of writing is v1.0.4 and a `feat:` commit
 * bumps minor, that next version is v1.1.0 — pinned here as a literal
 * constant (not derived) so recovery logic can never silently drift if a
 * future change renumbers something.
 */
export const NPM_PUBLISH_CUTOFF_VERSION = '1.1.0'

export type NpmRecoveryDecision =
  | { action: 'skip'; reason: string }
  | { action: 'recover'; version: string; reason: string }

export interface PlanNpmRecoveryInput {
  /** Version derived from the latest tag reachable from HEAD, e.g. "1.2.3". */
  latestVersion: string
  /** `shouldPublishToNpm(process.env)` — recovery never applies while the gate is off. */
  npmPublishEnabled: boolean
  /** Whether the npm registry already has this exact version published (read-only check, resolved by the caller). */
  npmHasVersion: boolean
}

/**
 * Pure decision for the "no commits since last tag" skip path: given the
 * latest tag's version, whether npm publishing is even enabled, and
 * whether the registry already has that version, decide whether to recover
 * a stranded npm publish instead of a plain skip.
 */
export function planNpmRecovery(input: PlanNpmRecoveryInput): NpmRecoveryDecision {
  const { latestVersion, npmPublishEnabled, npmHasVersion } = input

  if (!npmPublishEnabled) {
    return { action: 'skip', reason: 'NPM_PUBLISH repo variable not enabled — nothing to recover' }
  }

  if (compareSemver(latestVersion, NPM_PUBLISH_CUTOFF_VERSION) < 0) {
    return {
      action: 'skip',
      reason:
        `v${latestVersion} predates npm publishing (cutoff v${NPM_PUBLISH_CUTOFF_VERSION}) — ` +
        'never retroactively published',
    }
  }

  if (npmHasVersion) {
    return { action: 'skip', reason: `v${latestVersion} is already published to npm` }
  }

  return {
    action: 'recover',
    version: latestVersion,
    reason: `recovering unpublished npm version v${latestVersion} — missing from the npm registry`,
  }
}

/**
 * Read-only npm registry check for one exact version of a package
 * (`GET https://registry.npmjs.org/<name>/<version>`, the single-version
 * packument endpoint). 404 means "not published" — every other failure
 * (network error, 5xx, unexpected status) throws, so a registry outage is
 * never mistaken for "not published" and silently republished/skipped.
 *
 * The package is scoped (`@schlomo/odl-drawcustom-designer`, 2026-08-16) —
 * the registry API requires the `/` between scope and name to be
 * URL-encoded as `%2F` (docs.npmjs.com's scoped-package registry examples;
 * the `@` itself stays unescaped). A plain, unscoped name has no `/` to
 * encode, so this is a no-op for it.
 */
export async function checkNpmRegistryHasVersion(packageName: string, version: string): Promise<boolean> {
  const encodedName = packageName.replace('/', '%2F')
  const url = `https://registry.npmjs.org/${encodedName}/${version}`
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(
      `npm registry check failed for ${packageName}@${version}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (response.status === 404) {
    return false
  }
  if (!response.ok) {
    throw new Error(`npm registry check failed for ${packageName}@${version}: HTTP ${response.status}`)
  }
  return true
}
