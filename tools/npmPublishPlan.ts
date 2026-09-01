/**
 * The npm job's publish decision (`tools/publishNpm.ts`) — pure, so it is
 * unit-tested without mocking the network.
 *
 * The npm publish and the GitHub Pages deploy are two independent jobs that
 * fan out from the one job that computed the version and created the release
 * (docs/releasing.md). Either can fail without demoting the other, so
 * re-running the failed job alone is the recovery path (AGENTS.md,
 * "re-running is the upgrade path") — which only works if publishing is
 * IDEMPOTENT. Hence this decision on every run, not just after a failure:
 * ask the registry whether this exact version is already there, publish only
 * when it is not.
 *
 * The read-only registry lookup (`checkNpmRegistryHasVersion`) is a separate
 * async function that distinguishes "not published" (404) from any other
 * failure (network down, 5xx) — a registry outage must fail loudly, never be
 * silently read as "not published" (AGENTS.md, "fail early and loudly").
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
 * Cutoff below which a publish must never fire. v1.0.0–v1.0.4 were released
 * before npm publishing existed at all (issue #103 added it) — those GitHub
 * releases carry no npm-related assets and were never meant to reach npm, so
 * a run whose HEAD sits on one of those tags must not retroactively publish
 * it. v1.1.0 was the first version that could carry an npm publish — pinned
 * here as a literal constant (not derived) so this can never silently drift
 * if a future change renumbers something.
 */
export const NPM_PUBLISH_CUTOFF_VERSION = '1.1.0'

export type NpmPublishDecision =
  | { action: 'skip'; reason: string }
  | { action: 'publish'; version: string; reason: string }

export interface PlanNpmPublishInput {
  /** The version this run releases — the `version` job's output, e.g. "1.2.3". */
  version: string
  /** `shouldPublishToNpm(process.env)` — nothing is published while the gate is off. */
  npmPublishEnabled: boolean
  /** Whether the npm registry already has this exact version published (read-only check, resolved by the caller). */
  npmHasVersion: boolean
}

/**
 * Pure publish decision: given the run's version, whether npm publishing is
 * enabled at all, and whether the registry already has that version, decide
 * whether to publish. An already-published version is a clean skip, not an
 * error — that is what makes re-running the npm job safe (and what recovers
 * a version whose publish failed after its GitHub release was created).
 */
export function planNpmPublish(input: PlanNpmPublishInput): NpmPublishDecision {
  const { version, npmPublishEnabled, npmHasVersion } = input

  if (!npmPublishEnabled) {
    return { action: 'skip', reason: 'NPM_PUBLISH repo variable not enabled — nothing to publish' }
  }

  if (compareSemver(version, NPM_PUBLISH_CUTOFF_VERSION) < 0) {
    return {
      action: 'skip',
      reason:
        `v${version} predates npm publishing (cutoff v${NPM_PUBLISH_CUTOFF_VERSION}) — ` +
        'never retroactively published',
    }
  }

  if (npmHasVersion) {
    return { action: 'skip', reason: `v${version} is already published to npm` }
  }

  return {
    action: 'publish',
    version,
    reason: `v${version} is missing from the npm registry — publishing it`,
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
  const encodedName = packageName.replaceAll('/', '%2F')
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
