import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NPM_PUBLISH_SKIP_MESSAGE, shouldPublishToNpm, writeGithubStepSummary } from './npmPublish.ts'
import { NPM_PACKAGE_NAME } from './npmPackage.ts'
import { checkNpmRegistryHasVersion, planNpmRecovery } from './npmRecovery.ts'
import { writeChecksumFile } from './releaseChecksum.ts'
import { stageNpmPackage } from './stageNpmPackage.ts'
import {
  bundledDependencyNames,
  collectBundledDependencyInfo,
  generateThirdPartyMarkdown,
  resolveTransitiveRuntimeDependencyPaths,
  type PackageLockFile,
} from './thirdPartyNotices.ts'

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
// Anchored to the start of a line (multiline `^`) per the conventional-commits
// footer spec — without the anchor, a squash-merge body that merely quotes
// "BREAKING CHANGE:" mid-sentence (GitHub concatenates sub-commit lines into
// one body) would force a false major bump.
const BREAKING_CHANGE_FOOTER = /^BREAKING[ -]CHANGE:/m

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
 * base for the next bump — a reviewer finding on the pre-rework version of
 * this script, which listed all matching tags repo-wide.
 */
export function gitTagListArgs(): string[] {
  return ['tag', '--list', 'v*.*.*', '--merged', 'HEAD', '--sort=-v:refname']
}

/**
 * Environment required by the `import.meta.main` publish steps below, pulled
 * out as a pure function so the "fail loudly up front" guard is unit-tested
 * rather than only exercised for real by the workflow (AGENTS.md, "fail
 * early and loudly"). Checked BEFORE the (slow) library build so a manual
 * run missing either var fails immediately instead of after a full build.
 */
export function requireReleaseEnv(env: NodeJS.ProcessEnv): { targetSha: string } {
  const targetSha = env.GITHUB_SHA
  if (!targetSha) {
    throw new Error(
      'GITHUB_SHA is not set — this script publishes a release tagged at a specific commit ' +
        'and must run inside GitHub Actions (or with GITHUB_SHA set manually)',
    )
  }
  if (!env.GH_TOKEN) {
    throw new Error(
      'GH_TOKEN is not set — this script publishes a GitHub release via `gh release create` ' +
        'and must run inside GitHub Actions (or with GH_TOKEN set manually for a local retry)',
    )
  }
  return { targetSha }
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

/**
 * Third-party license inventory (issue #103) — the transitive closure of
 * package.json's direct "dependencies", traversed through
 * `package-lock.json`'s locked graph (production deps only, issue #113
 * review finding: a direct-deps-only list missed packages like
 * crelt/style-mod/w3c-keyname that @codemirror/view itself pulls in). That
 * full closure is the exact set vite.lib.config.ts bundles into the single
 * ESM (no externals, no code splitting). NOT a heavyweight scanner; fails
 * loudly if any bundled package is missing a license field. Shared by the
 * normal release path and the npm-recovery path below, which both need to
 * regenerate the same markdown for staging.
 */
export function buildThirdPartyMarkdown(repoRoot: string): string {
  const repoPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const packageLock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8')) as PackageLockFile
  const resolvedPaths = resolveTransitiveRuntimeDependencyPaths(packageLock, bundledDependencyNames(repoPackageJson))
  return generateThirdPartyMarkdown(collectBundledDependencyInfo(resolvedPaths, repoRoot))
}

/**
 * Rebuilds the library for one exact version and assembles the npm staging
 * directory (`dist-npm/`) — the same steps the normal release path runs
 * before `gh release create`, factored out so the recovery path (a later
 * run publishing a version whose GitHub release already exists) can reuse
 * them without re-creating any tag/release.
 */
function buildAndStageNpmPackage(version: string, repoRoot: string): { stagingDir: string } {
  execFileSync('npm', ['run', 'build:lib'], {
    stdio: 'inherit',
    env: { ...process.env, APP_VERSION: version },
  })
  const distLibJsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.js')
  const distLibDtsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.d.ts')
  const thirdPartyMarkdown = buildThirdPartyMarkdown(repoRoot)
  const stagingDir = join(repoRoot, 'dist-npm')
  stageNpmPackage({ version, repoRoot, distLibJsPath, distLibDtsPath, stagingDir, thirdPartyMarkdown })
  return { stagingDir }
}

/**
 * Runs `npm publish` against an already-staged directory. Trusted
 * Publishing (OIDC) needs no token — the workflow's `id-token: write`
 * permission plus a trusted publisher configured on npmjs.com for this
 * repo/workflow is what authenticates the publish; `--provenance` is kept
 * explicit as belt-and-suspenders even though npm auto-generates
 * provenance under trusted publishing (docs.npmjs.com/trusted-publishers).
 * Fails loudly on any error (trusted publisher not configured,
 * name/version collision, network) — once `NPM_PUBLISH` is enabled, a
 * broken publish must break the run.
 */
function publishToNpm(stagingDir: string, tag: string): void {
  console.log(`Publishing ${tag} to npm...`)
  execFileSync('npm', ['publish', '--access', 'public', '--provenance'], {
    stdio: 'inherit',
    cwd: stagingDir,
  })
  console.log(`Published ${tag} to npm.`)
}

/**
 * Read the git plumbing `planRelease` (and `tools/siteVersion.ts`'s
 * `deriveSiteVersion`) need: the latest `vX.Y.Z` tag reachable from HEAD (if
 * any) and the full messages of every commit since it. Shared by this
 * script's own CLI entry point below and `tools/siteVersion.ts`'s, so the
 * production site build derives its version from the exact same git state
 * auto-release does — never a second, possibly-drifted query. Not
 * unit-tested (git/gh plumbing, same as the rest of this `import.meta.main`
 * block) — exercised for real by the workflows.
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
  const { latestTag, commitMessagesSinceTag } = readReleaseInputFromGit()

  const plan = planRelease({ latestTag, commitMessagesSinceTag })

  if (plan.skip) {
    console.log(`Skipping release: ${plan.reason}`)

    // Recovery for a partial-failure gap (issue #113 review finding):
    // `gh release create` below is irreversible (creates the tag), but `npm
    // publish` runs after it. If publish fails there, the *next* run lands
    // here — same tag, zero commits since it — and would silently skip
    // forever without this check (AGENTS.md, "re-running is the upgrade
    // path"). Read-only registry check + pure decision in
    // tools/npmRecovery.ts; only consulted when npm publishing is even
    // configured, and never for versions predating npm publishing.
    if (latestTag && shouldPublishToNpm(process.env)) {
      const latestVersion = versionFromTag(latestTag)
      const npmHasVersion = await checkNpmRegistryHasVersion(NPM_PACKAGE_NAME, latestVersion)
      const recovery = planNpmRecovery({ latestVersion, npmPublishEnabled: true, npmHasVersion })

      if (recovery.action === 'recover') {
        console.log(recovery.reason)
        const repoRoot = process.cwd()
        const { stagingDir } = buildAndStageNpmPackage(recovery.version, repoRoot)
        publishToNpm(stagingDir, `v${recovery.version}`)
        writeGithubStepSummary(
          process.env,
          `## 📦 Recovered npm publish\n\n${recovery.reason}\n\n` +
            `This run found no new commits to release, but v${recovery.version} was missing from the ` +
            `npm registry (a prior run's \`npm publish\` step must have failed after its GitHub release ` +
            `was already created) and has now been published — see docs/releasing.md#partial-failure-recovery.\n`,
        )
      } else {
        console.log(`npm recovery check: ${recovery.reason}`)
      }
    }

    process.exit(0)
  }

  const tag = `v${plan.version}`
  console.log(`Releasing ${tag}: ${plan.reason}`)

  const { targetSha } = requireReleaseEnv(process.env)

  const repoRoot = process.cwd()
  const distLibJsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.js')
  // Bundled declaration file (issue #122) — a sibling of the ESM, produced by
  // the same build:lib run (vite.lib.config.ts's dts() plugin). Declaration
  // generation failing loudly (tools/dtsDiagnostics.ts) means this file is
  // guaranteed present whenever the build step below succeeds.
  const distLibDtsPath = join(repoRoot, 'dist-lib', 'odl-drawcustom-designer.d.ts')

  // Build the library with the derived version injected (tools/version.ts /
  // tools/buildDefines.ts read APP_VERSION from the environment).
  execFileSync('npm', ['run', 'build:lib'], {
    stdio: 'inherit',
    env: { ...process.env, APP_VERSION: plan.version },
  })

  // Third-party license inventory (issue #103) — the full transitive closure
  // of production runtime deps (package-lock.json), the exact set
  // vite.lib.config.ts bundles into the single ESM. NOT a heavyweight
  // scanner; fails loudly if any bundled package is missing a license field.
  const thirdPartyMarkdown = buildThirdPartyMarkdown(repoRoot)
  const thirdPartyPath = join(repoRoot, 'dist-lib', 'THIRD_PARTY.md')
  writeFileSync(thirdPartyPath, thirdPartyMarkdown)

  // sha256 checksums of the built artifacts — release assets, verifiable with
  // `shasum -a 256 -c` (bare `-c` defaults to SHA-1 and mis-verifies). The
  // declaration file gets its own checksum alongside the ESM's, same as every
  // other binary release asset.
  const checksumPath = writeChecksumFile(distLibJsPath)
  const dtsChecksumPath = writeChecksumFile(distLibDtsPath)

  // Stage the npm package BEFORE the irreversible `gh release create` below
  // (issue #113 review finding): this is pure file assembly (copy the built
  // ESM, write a generated package.json, LICENSE/NOTICE/THIRD_PARTY.md) with
  // no network call, so it belongs with the other fail-fast-before-
  // irreversible steps above, same as the checksum/third-party generation.
  // The only step that still runs AFTER the release is the actual `npm
  // publish` network call further down — that one genuinely can't move
  // earlier, since it publishes the version the release just claimed.
  const stagingDir = join(repoRoot, 'dist-npm')
  stageNpmPackage({
    version: plan.version,
    repoRoot,
    distLibJsPath,
    distLibDtsPath,
    stagingDir,
    thirdPartyMarkdown,
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
      distLibJsPath,
      distLibDtsPath,
      'LICENSE',
      'NOTICE',
      thirdPartyPath,
      checksumPath,
      dtsChecksumPath,
      '--title',
      tag,
      '--generate-notes',
      '--target',
      targetSha,
    ],
    { stdio: 'inherit' },
  )

  console.log(`Released ${tag}.`)

  // Staged npm-publish rollout (issue #103, reworked to Trusted Publishing
  // per maintainer ruling 2026-08-16): the `NPM_PUBLISH` repo variable
  // gates publishing — until the maintainer has claimed the package name
  // (manual first publish) and configured a trusted publisher on npmjs.com
  // for this repo/workflow, the variable stays unset. That's a deliberate,
  // documented exception to "fail loudly" — warn prominently and continue;
  // once enabled, a publish failure DOES fail the run. If that publish
  // below fails, the recovery check in the skip branch above heals it on
  // the next run (any trigger) without ever re-running `gh release create`.
  if (!shouldPublishToNpm(process.env)) {
    console.log(NPM_PUBLISH_SKIP_MESSAGE)
    writeGithubStepSummary(
      process.env,
      `## ⚠️ npm publish skipped\n\n${NPM_PUBLISH_SKIP_MESSAGE}\n\n` +
        `GitHub release ${tag} was published normally. Set the \`NPM_PUBLISH\` repository variable ` +
        `to \`enabled\` (after claiming the name and configuring a trusted publisher) to enable npm ` +
        `publishing on the next release — see docs/releasing.md#npm.\n`,
    )
  } else {
    publishToNpm(stagingDir, tag)
  }
}
