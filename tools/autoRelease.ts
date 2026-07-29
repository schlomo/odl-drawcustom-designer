import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { versionFromTag } from './releaseVersion'

/**
 * Auto-release on push to main (issue #93). This is the "thin CI" logic
 * (AGENTS.md) called by `.github/workflows/auto-release.yml`: read commits
 * since the last `vX.Y.Z` tag, derive a semver bump from their conventional-
 * commit titles, bump `package.json` (+ lockfile), commit, tag, and push.
 * The pushed tag then triggers the existing tag-driven release workflow
 * (`.github/workflows/release.yml`, issue #23), which is the single
 * release mechanism and stays untouched — this script only ever produces
 * the tag push that feeds it.
 *
 * Everything decision-shaped (bump derivation, precedence, loop guard, the
 * no-tag-yet case) is a pure function below, unit-tested in
 * tests/tools/autoRelease.test.ts. Only the `import.meta.main` block does
 * git plumbing (reading tags/log, committing/tagging/pushing) and file
 * writes — not unit-tested, exercised for real by the workflow.
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

/**
 * Loop guard (issue #93): this script's own release commits must never
 * trigger another bump. The auto-release workflow's every push-to-main run
 * checks HEAD's subject against this before doing anything else — the
 * bump commit it creates always matches, so the run it triggers stops here.
 */
export function isReleaseCommit(subject: string): boolean {
  return /^chore\(release\):/.test(subject.trim())
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

export type ReleaseDecision =
  | { skip: true; reason: string }
  | { skip: false; mode: 'first-release'; version: string; reason: string }
  | { skip: false; mode: 'bump'; version: string; bump: Bump; reason: string }

export interface PlanReleaseInput {
  /** Subject line of the current HEAD commit — the loop guard checks this first. */
  headSubject: string
  /** Latest `vX.Y.Z` tag reachable from HEAD, or `undefined` if none exists yet. */
  latestTag: string | undefined
  /** Current package.json `version` — only used for the no-tag-yet (first release) case. */
  packageVersion: string
  /** Full messages (subject + body) of commits strictly after `latestTag`, in any order. */
  commitMessagesSinceTag: string[]
}

/**
 * Pure decision logic for the auto-release workflow: given the repo state,
 * decide whether to release and, if so, what version and why. All git
 * plumbing and file/network side effects happen in the CLI entry point
 * below — this is what's unit-tested (AGENTS.md, "Behavior tests only").
 */
export function planRelease(input: PlanReleaseInput): ReleaseDecision {
  if (isReleaseCommit(input.headSubject)) {
    return { skip: true, reason: 'HEAD is a release-bump commit (loop guard) — skipping' }
  }

  if (!input.latestTag) {
    return {
      skip: false,
      mode: 'first-release',
      version: input.packageVersion,
      reason: 'no release tag exists yet — releasing the current package.json version as-is',
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

  const headSubject = git(['log', '-1', '--format=%s']).trim()

  const tagList = git(['tag', '--list', 'v*.*.*', '--sort=-v:refname'])
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
  const latestTag = tagList[0]

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

  const commitMessagesSinceTag = latestTag
    ? parseCommitMessages(git(['log', `${latestTag}..HEAD`, '--format=%B%x00']))
    : []

  const plan = planRelease({
    headSubject,
    latestTag,
    packageVersion: pkg.version,
    commitMessagesSinceTag,
  })

  if (plan.skip) {
    console.log(`Skipping release: ${plan.reason}`)
    process.exit(0)
  }

  console.log(`Releasing v${plan.version}: ${plan.reason}`)

  if (plan.mode === 'bump') {
    // package.json/package-lock.json actually change here — commit them.
    execFileSync('npm', ['version', plan.version, '--no-git-tag-version'], { stdio: 'inherit' })
    execFileSync('git', ['config', 'user.name', 'github-actions[bot]'])
    execFileSync('git', [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ])
    execFileSync('git', ['add', 'package.json', 'package-lock.json'])
    execFileSync('git', ['commit', '-m', `chore(release): v${plan.version}`])
    execFileSync('git', ['tag', `v${plan.version}`])
    execFileSync('git', ['push', 'origin', 'HEAD:main'])
    execFileSync('git', ['push', 'origin', `v${plan.version}`])
  } else {
    // First release: package.json already reads plan.version — no bump, no
    // commit needed, just tag the current HEAD as-is.
    execFileSync('git', ['tag', `v${plan.version}`])
    execFileSync('git', ['push', 'origin', `v${plan.version}`])
  }

  console.log(`Pushed v${plan.version}.`)
}
