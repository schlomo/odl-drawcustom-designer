import { planRelease, readReleaseInputFromGit, versionFromTag, type PlanReleaseInput } from './autoRelease.ts'

/**
 * Derive the version the standalone site's header should display for a
 * production build at HEAD — reusing `planRelease` (the exact bump
 * algorithm `tools/autoRelease.ts` runs on push to main) so the label is
 * correct by construction, with no dependency on tag timing.
 *
 * The Pages `production` job and the Auto Release workflow both trigger on
 * the same push and run concurrently; the new `vX.Y.Z` tag does not exist
 * yet while the site is building. Re-deriving "the version auto-release is
 * about to publish" from the same inputs (last release tag + commits since
 * it) — rather than `git describe --tags`, which would report the
 * PREVIOUS release — means the two workflows can never disagree and there
 * is no second deploy once the tag lands. See docs/releasing.md#site-version.
 *
 * Returns `undefined` when the version cannot be safely derived — no
 * `vX.Y.Z` tag is reachable from HEAD at all. That is ambiguous: it could
 * mean a genuinely unreleased repo (which is what `planRelease`'s
 * `first-release` mode assumes, correctly, for the release script itself),
 * but far more likely in a site build it means a shallow clone (the
 * default for `actions/checkout`), a fork with no tags, or a local `npm
 * run build:site`. A site header showing a guessed `v1.0.0` on an
 * already-`v2.x` repo would be actively wrong — worse than the old
 * branch+SHA label — so this deliberately does NOT fall back to
 * `planRelease`'s first-release version. The caller must treat `undefined`
 * as "omit the version, show branch + SHA instead", never as a version
 * string of its own.
 */
export function deriveSiteVersion(input: PlanReleaseInput): string | undefined {
  if (!input.latestTag) {
    return undefined
  }
  const plan = planRelease(input)
  if (plan.skip) {
    // No commits since the latest tag — HEAD IS that release.
    return versionFromTag(input.latestTag)
  }
  return plan.version
}

if (import.meta.main) {
  const version = deriveSiteVersion(readReleaseInputFromGit())
  // Print exactly the version, and nothing else, so the workflow can
  // capture stdout verbatim into a step output. Print nothing (not even a
  // placeholder) when it cannot be derived — the degrade-to-no-version
  // case is a silent, empty result by design, not a logged warning.
  if (version) {
    process.stdout.write(version)
  }
}
