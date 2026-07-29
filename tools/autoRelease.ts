import { execFileSync } from 'node:child_process'

/**
 * Auto-release on push to main (issue #93, reworked 2026-07-29 per
 * maintainer ruling: KISS, long-term, no PAT). This is the "thin CI" logic
 * (AGENTS.md) called by `.github/workflows/auto-release.yml`: read commits
 * since the last `vX.Y.Z` tag reachable from HEAD, derive a semver bump from
 * their conventional-commit titles, build the library with that version
 * injected, and publish it as a GitHub release — `gh release create` CREATES
 * the tag itself. Nothing is ever pushed to `main` (no bump commit, no
 * package.json write), so there is no loop guard to worry about; the
 * default `GITHUB_TOKEN` suffices because no downstream workflow needs to
 * trigger off the tag.
 *
 * Everything decision-shaped (bump derivation, precedence, tag parsing, the
 * no-tag-yet case) is a pure function below, unit-tested in
 * tests/tools/autoRelease.test.ts. Only the `import.meta.main` block does
 * git/gh plumbing (reading tags/log, building, publishing) — not
 * unit-tested, exercised for real by the workflow.
 */

export type Bump = 'major' | 'minor' | 'patch'

const BUMP_RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 }

// Conventional-commit subject: `type(scope)!: description`. Scope and bang
// are both optional; only the subject line is inspected for type/bang — a
// "!" or the word "feat" appearing in the body must not affect the bump.
const CONVENTIONAL_SUBJECT = /^(\w+)(\([^)]*\))?(!)?:\s/
const BREAKING_CHANGE_FOOTER = /BREAKING[ -]CHANGE:/

/**
 * Bump size for one full commit message (subject + body), per the
 * conventional-commit convention agreed in issue #93: `feat:` → minor;
 * `feat!:`/any type with `!`/a `BREAKING CHANGE:` footer → major;
 * everything else (fix/chore/build/non-conventional) → patch.
 */
export function bumpForCommit(message: string): Bump {
  const subject = message.split('\n', 1)[0] ?? ''
  const match = CONVENTIONAL_SUBJECT.exec(subject)
  const hasBang = match?.[3] === '!'
  const type = match?.[1]
  if (hasBang || BREAKING_CHANGE_FOOTER.test(message)) {
    return 'major'
  }
  if (type === 'feat') {
    return 'minor'
  }
  return 'patch'
}

/** Highest-severity bump across commits since the last release. `undefined` when there are none. */
export function maxBump(bumps: Bump[]): Bump | undefined {
  if (bumps.length === 0) {
    return undefined
  }
  return bumps.reduce((max, bump) => (BUMP_RANK[bump] > BUMP_RANK[max] ? bump : max))
}

const PLAIN_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/** Apply a conventional-commit bump to a plain `X.Y.Z` version string. */
export function applyBump(version: string, bump: Bump): string {
  const match = PLAIN_SEMVER.exec(version.trim())
  if (!match) {
    throw new Error(`Version "${version}" is not a plain X.Y.Z semver — cannot bump`)
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (bump === 'major') {
    return `${major + 1}.0.0`
  }
  if (bump === 'minor') {
    return `${major}.${minor + 1}.0`
  }
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Split the raw output of `git log <range> --format=%B%x00` (full commit
 * messages, NUL-separated) into individual trimmed messages, dropping any
 * empty entries (trailing separator, blank bodies).
 */
export function parseCommitMessages(rawLog: string): string[] {
  return rawLog
    .split('\0')
    .map((message) => message.trim())
    .filter((message) => message.length > 0)
}

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/

/** Extract the semver from a `vX.Y.Z` tag. Throws on any tag that isn't exactly `vX.Y.Z`. */
export function versionFromTag(tag: string): string {
  const match = TAG_PATTERN.exec(tag.trim())
  if (!match) {
    throw new Error(`Tag "${tag}" must match vX.Y.Z (e.g. v1.2.3) — no pre-release/build suffixes`)
  }
  return match[1]!
}

/**
 * Args for `git tag --list`, restricted to release tags **reachable from
 * HEAD** (`--merged HEAD`). Without that flag a stray `vX.Y.Z` tag pushed on
 * some unmerged branch would sort ahead by version and silently become the
 * base for the next bump — a reviewer finding on the pre-rework version of
 * this script, which listed all matching tags repo-wide.
 */
export function gitTagListArgs(): string[] {
  return ['tag', '--list', 'v*.*.*', '--merged', 'HEAD', '--sort=-v:refname']
}

export type ReleaseDecision =
  | { skip: true; reason: string }
  | { skip: false; mode: 'first-release'; version: string; reason: string }
  | { skip: false; mode: 'bump'; version: string; bump: Bump; reason: string }

export interface PlanReleaseInput {
  /** Latest `vX.Y.Z` tag reachable from HEAD, or `undefined` if none exists yet. */
  latestTag: string | undefined
  /** Full messages (subject + body) of commits strictly after `latestTag`, in any order. */
  commitMessagesSinceTag: string[]
}

/**
 * Pure decision logic for the auto-release workflow: given the repo state,
 * decide whether to release and, if so, what version and why. All git/gh
 * plumbing and the library build happen in the CLI entry point below —
 * this is what's unit-tested (AGENTS.md, "Behavior tests only").
 */
export function planRelease(input: PlanReleaseInput): ReleaseDecision {
  if (!input.latestTag) {
    return {
      skip: false,
      mode: 'first-release',
      version: '1.0.0',
      reason: 'no release tag reachable from HEAD yet — first release is v1.0.0',
    }
  }

  if (input.commitMessagesSinceTag.length === 0) {
    return { skip: true, reason: `no commits since ${input.latestTag} — nothing to release` }
  }

  const bump = maxBump(input.commitMessagesSinceTag.map(bumpForCommit))!
  const baseVersion = versionFromTag(input.latestTag)
  return {
    skip: false,
    mode: 'bump',
    version: applyBump(baseVersion, bump),
    bump,
    reason: `${input.commitMessagesSinceTag.length} commit(s) since ${input.latestTag} — bump: ${bump}`,
  }
}

if (import.meta.main) {
  const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' })

  const tagList = git(gitTagListArgs())
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
  const latestTag = tagList[0]

  const commitMessagesSinceTag = latestTag
    ? parseCommitMessages(git(['log', `${latestTag}..HEAD`, '--format=%B%x00']))
    : []

  const plan = planRelease({ latestTag, commitMessagesSinceTag })

  if (plan.skip) {
    console.log(`Skipping release: ${plan.reason}`)
    process.exit(0)
  }

  const tag = `v${plan.version}`
  console.log(`Releasing ${tag}: ${plan.reason}`)

  const targetSha = process.env.GITHUB_SHA
  if (!targetSha) {
    throw new Error(
      'GITHUB_SHA is not set — this script publishes a release tagged at a specific commit ' +
        'and must run inside GitHub Actions (or with GITHUB_SHA set manually)',
    )
  }

  // Build the library with the derived version injected (tools/version.ts /
  // tools/buildDefines.ts read APP_VERSION from the environment).
  execFileSync('npm', ['run', 'build:lib'], {
    stdio: 'inherit',
    env: { ...process.env, APP_VERSION: plan.version },
  })

  // Creates the tag AND the release in one step (nothing is pushed to
  // main). If the tag/release already exists this fails loudly — every
  // main push derives a fresh version from tag ancestry, so a collision is
  // a real error (e.g. a concurrent run, or a manual retry that shouldn't
  // have been needed), not something to paper over.
  execFileSync(
    'gh',
    [
      'release',
      'create',
      tag,
      'dist-lib/odl-drawcustom-designer.js',
      'LICENSE',
      '--title',
      tag,
      '--generate-notes',
      '--target',
      targetSha,
    ],
    { stdio: 'inherit' },
  )

  console.log(`Released ${tag}.`)
}
