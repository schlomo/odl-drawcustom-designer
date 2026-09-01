import { execFileSync } from 'node:child_process'
import { writeGithubOutput } from './githubOutput.ts'

/**
 * The version a push to `main` releases — computed ONCE, up front, and
 * consumed by everything downstream (maintainer ruling 2026-09-01). This is
 * step one of the release pipeline (`.github/workflows/auto-release.yml`,
 * docs/releasing.md): its `version` job runs this script, publishes the
 * result as a job output, and the two publish jobs that fan out from it —
 * npm and GitHub Pages — both bake that same string. The version is a FACT
 * for the whole run, never a prediction: the deleted `tools/siteVersion.ts`
 * existed only because the site build raced tag creation and had to
 * re-derive "the version auto-release is about to publish". Removing the
 * race removed the prediction.
 *
 * Every decision here is a pure function, unit-tested in
 * tests/tools/releaseVersion.test.ts (thin CI, AGENTS.md). Only
 * `readReleaseInputFromGit` and the `import.meta.main` block touch git — and
 * both are side-effect-free reads, so `node tools/releaseVersion.ts` reports
 * the next version on a laptop exactly as it does in CI.
 */

export type Bump = 'major' | 'minor' | 'patch'

const BUMP_RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 }

// Conventional-commit subject: `type(scope)!: description`. Scope and bang
// are both optional; only the subject line is inspected for type/bang — a
// "!" or the word "feat" appearing in the body must not affect the bump.
const CONVENTIONAL_SUBJECT = /^(\w+)(\([^)]*\))?(!)?:\s/
// Anchored to the start of a line (multiline `^`) per the conventional-commits
// footer spec — without the anchor, a squash-merge body that merely quotes
// "BREAKING CHANGE:" mid-sentence (GitHub concatenates sub-commit lines into
// one body) would force a false major bump.
const BREAKING_CHANGE_FOOTER = /^BREAKING[ -]CHANGE:/m

/**
 * Bump size for one full commit message (subject + body), per the
 * conventional-commit convention agreed in issue #93 and confirmed by the
 * maintainer 2026-09-01: `feat:` → minor; `feat!:`/any type with `!`/a
 * `BREAKING CHANGE:` footer → major; **everything else** — `fix:`, `docs:`,
 * `chore:`, `build(deps):`, a revert, a non-conventional subject — → patch.
 * There is no "no bump" outcome: every commit that reaches `main` is worth
 * at least a patch ("non-code pushes should bump patch IMHO, why not? more
 * consistent and doesn't cost").
 */
export function bumpForCommit(message: string): Bump {
  const subject = message.split('\n', 1)[0] ?? ''
  const match = CONVENTIONAL_SUBJECT.exec(subject)
  const hasBang = match?.[3] === '!'
  const type = match?.[1]?.toLowerCase()
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
 * base for the next bump — a reviewer finding on an earlier version of this
 * script, which listed all matching tags repo-wide.
 */
export function gitTagListArgs(): string[] {
  return ['tag', '--list', 'v*.*.*', '--merged', 'HEAD', '--sort=-v:refname']
}

export type ReleaseMode = 'first-release' | 'bump' | 'already-released'

export interface ReleasePlan {
  /** The version every downstream job bakes in. Always a real `X.Y.Z` — never absent. */
  version: string
  /** `v${version}` — the git tag / GitHub release name for `version`. */
  tag: string
  /**
   * Whether THIS run must create the tag and GitHub release for `version`.
   * `false` means the tag already exists and HEAD is that release: the two
   * publish jobs still run and reconcile idempotently (re-running is the
   * recovery path, AGENTS.md), they just must not re-create a release.
   */
  createRelease: boolean
  mode: ReleaseMode
  /** The derived bump — set only for `mode: 'bump'`. */
  bump?: Bump
  reason: string
}

export interface PlanReleaseInput {
  /** Latest `vX.Y.Z` tag reachable from HEAD, or `undefined` if none exists yet. */
  latestTag: string | undefined
  /** Full messages (subject + body) of commits strictly after `latestTag`, in any order. */
  commitMessagesSinceTag: string[]
}

/**
 * Decide the version this run publishes. Three outcomes, and all three carry
 * a real version — the pipeline has no "nothing to release" state any more:
 *
 * - **first-release** — no tag reachable from HEAD: `1.0.0`.
 * - **bump** — commits since the latest tag: at least a patch, always
 *   (maintainer ruling 2026-09-01), `feat:` minor, breaking major, max wins.
 * - **already-released** — no commits since the latest tag (a
 *   `workflow_dispatch`, or a re-run after a partial failure): HEAD *is*
 *   that release, so its version flows downstream unchanged and no new tag
 *   is created.
 */
export function planRelease(input: PlanReleaseInput): ReleasePlan {
  if (!input.latestTag) {
    return {
      version: '1.0.0',
      tag: 'v1.0.0',
      createRelease: true,
      mode: 'first-release',
      reason: 'no release tag reachable from HEAD yet — first release is v1.0.0',
    }
  }

  const baseVersion = versionFromTag(input.latestTag)

  if (input.commitMessagesSinceTag.length === 0) {
    return {
      version: baseVersion,
      tag: `v${baseVersion}`,
      createRelease: false,
      mode: 'already-released',
      reason: `no commits since ${input.latestTag} — HEAD is already released as ${input.latestTag}`,
    }
  }

  const bump = maxBump(input.commitMessagesSinceTag.map(bumpForCommit))!
  const version = applyBump(baseVersion, bump)
  return {
    version,
    tag: `v${version}`,
    createRelease: true,
    mode: 'bump',
    bump,
    reason: `${input.commitMessagesSinceTag.length} commit(s) since ${input.latestTag} — bump: ${bump}`,
  }
}

/**
 * Read the git state `planRelease` needs: the latest `vX.Y.Z` tag reachable
 * from HEAD (if any) and the full messages of every commit since it. Needs a
 * full-history checkout WITH tags (`fetch-depth: 0`) — the `version` job is
 * the only job in the pipeline that does.
 */
export function readReleaseInputFromGit(): PlanReleaseInput {
  const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' })

  const tagList = git(gitTagListArgs())
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
  const latestTag = tagList[0]

  const commitMessagesSinceTag = latestTag
    ? parseCommitMessages(git(['log', `${latestTag}..HEAD`, '--format=%B%x00']))
    : []

  return { latestTag, commitMessagesSinceTag }
}

if (import.meta.main) {
  const plan = planRelease(readReleaseInputFromGit())

  // stdout is the laptop-facing interface (`node tools/releaseVersion.ts`);
  // $GITHUB_OUTPUT is the CI-facing one. One computation, one set of values.
  console.log(`${plan.tag} (${plan.mode}) — ${plan.reason}`)
  writeGithubOutput(process.env, {
    version: plan.version,
    tag: plan.tag,
    'create-release': String(plan.createRelease),
  })
}
