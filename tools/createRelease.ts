import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeChecksumFile } from './releaseChecksum.ts'
import {
  bundledDependencyNames,
  collectBundledDependencyInfo,
  generateThirdPartyMarkdown,
  resolveTransitiveRuntimeDependencyPaths,
  type PackageLockFile,
} from './thirdPartyNotices.ts'

/**
 * Step two of the release pipeline (`.github/workflows/auto-release.yml`,
 * docs/releasing.md): build the library at the version
 * `tools/releaseVersion.ts` already computed, generate the release assets,
 * and — when this run is the one that owns that version — create the
 * `vX.Y.Z` tag and GitHub release with `gh release create`.
 *
 * It never computes a version of its own: `APP_VERSION` and `CREATE_RELEASE`
 * arrive from the `version` job's outputs (maintainer ruling 2026-09-01,
 * "compute the version ONCE, up front"). It also never publishes to npm —
 * that is a separate, parallel job (`tools/publishNpm.ts`) so a failed npm
 * publish cannot demote the Pages deploy, or vice versa.
 *
 * `gh release create` is the ONE irreversible step in the whole pipeline
 * (it creates the tag and the release together), which is why it sits here,
 * before the fan-out: both publish jobs then bake a version that is already
 * a published fact, and each can be re-run on its own against it.
 */

export interface ReleaseRunEnv {
  /** The version computed by the `version` job, e.g. "3.4.0". */
  version: string
  /** Whether this run must create the tag + release (the `version` job's `create-release` output). */
  createRelease: boolean
  /** Commit the tag points at — `GITHUB_SHA`, i.e. exactly the commit that was gated. */
  targetSha: string
}

const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/

/**
 * Read and validate the environment the steps below need, as a pure
 * function so the "fail loudly up front" guard is unit-tested rather than
 * only exercised for real by the workflow (AGENTS.md). Checked BEFORE the
 * slow library build, so a misconfigured run fails in seconds.
 *
 * `CREATE_RELEASE` must be exactly `"true"` or `"false"`: it comes from a
 * job output, and a typo or an empty value silently read as "false" would
 * skip the release without anyone noticing.
 */
export function requireReleaseEnv(env: NodeJS.ProcessEnv): ReleaseRunEnv {
  const version = env.APP_VERSION?.trim()
  if (!version || !PLAIN_SEMVER.test(version)) {
    throw new Error(
      `APP_VERSION must be a plain X.Y.Z version computed by tools/releaseVersion.ts — got ${JSON.stringify(env.APP_VERSION ?? null)}`,
    )
  }
  const createReleaseRaw = env.CREATE_RELEASE?.trim()
  if (createReleaseRaw !== 'true' && createReleaseRaw !== 'false') {
    throw new Error(
      `CREATE_RELEASE must be exactly "true" or "false" (from the version job's create-release output) — got ${JSON.stringify(env.CREATE_RELEASE ?? null)}`,
    )
  }
  const targetSha = env.GITHUB_SHA
  if (!targetSha) {
    throw new Error(
      'GITHUB_SHA is not set — this script tags a release at a specific commit and must run inside ' +
        'GitHub Actions (or with GITHUB_SHA set manually)',
    )
  }
  if (createReleaseRaw === 'true' && !env.GH_TOKEN) {
    throw new Error(
      'GH_TOKEN is not set — this script publishes a GitHub release via `gh release create` and must run ' +
        'inside GitHub Actions (or with GH_TOKEN set manually for a local retry)',
    )
  }
  return { version, createRelease: createReleaseRaw === 'true', targetSha }
}

/**
 * Third-party license inventory (issue #103) — the transitive closure of
 * package.json's direct "dependencies", traversed through
 * `package-lock.json`'s locked graph (production deps only, issue #113
 * review finding: a direct-deps-only list missed packages like
 * crelt/style-mod/w3c-keyname that @codemirror/view itself pulls in). That
 * full closure is the exact set vite.lib.config.ts bundles into the single
 * ESM. NOT a heavyweight scanner; fails loudly if any bundled package is
 * missing a license field.
 */
export function buildThirdPartyMarkdown(repoRoot: string): string {
  const repoPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const packageLock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8')) as PackageLockFile
  const resolvedPaths = resolveTransitiveRuntimeDependencyPaths(packageLock, bundledDependencyNames(repoPackageJson))
  return generateThirdPartyMarkdown(collectBundledDependencyInfo(resolvedPaths, repoRoot))
}

/** `gh release create` args — pure, so the asset list and `--target` pinning are unit-tested. */
export function ghReleaseCreateArgs(tag: string, targetSha: string, assetPaths: string[]): string[] {
  return ['release', 'create', tag, ...assetPaths, '--title', tag, '--generate-notes', '--target', targetSha]
}

if (import.meta.main) {
  const { version, createRelease, targetSha } = requireReleaseEnv(process.env)
  const tag = `v${version}`
  const repoRoot = process.cwd()

  const distLibDir = join(repoRoot, 'dist-lib')
  const distLibJsPath = join(distLibDir, 'odl-drawcustom-designer.js')
  // Bundled declaration file (issue #122) — a sibling of the ESM, produced by
  // the same build:lib run (vite.lib.config.ts's dts() plugin). Declaration
  // generation failing loudly (tools/dtsDiagnostics.ts) means this file is
  // guaranteed present whenever the build step below succeeds.
  const distLibDtsPath = join(distLibDir, 'odl-drawcustom-designer.d.ts')

  // Build the library with the ALREADY-DECIDED version injected
  // (tools/version.ts / tools/buildDefines.ts read APP_VERSION from the
  // environment). Built unconditionally, including when the release already
  // exists: the npm job consumes `dist-lib/` as this job's artifact, so a
  // re-run after a failed publish has the same bytes to reconcile with.
  console.log(`Building the library for ${tag}...`)
  execFileSync('npm', ['run', 'build:lib'], {
    stdio: 'inherit',
    env: { ...process.env, APP_VERSION: version },
  })

  const thirdPartyPath = join(distLibDir, 'THIRD_PARTY.md')
  writeFileSync(thirdPartyPath, buildThirdPartyMarkdown(repoRoot))

  // sha256 checksums of the built artifacts — release assets, verifiable with
  // `shasum -a 256 -c` (bare `-c` defaults to SHA-1 and mis-verifies).
  const checksumPath = writeChecksumFile(distLibJsPath)
  const dtsChecksumPath = writeChecksumFile(distLibDtsPath)

  if (!createRelease) {
    // `already-released` (tools/releaseVersion.ts): HEAD is this tag. Not an
    // error and not a skip of the run — the artifacts above are still built
    // and handed to the publish jobs, which reconcile idempotently.
    console.log(`${tag} is already released — not re-creating the tag/release; publish jobs will reconcile.`)
    process.exit(0)
  }

  // Creates the tag AND the release in one step (nothing is pushed to main).
  // If the tag/release already exists this fails loudly: the version job
  // reports `create-release: false` for a tag reachable from HEAD, so a
  // collision here means something is genuinely wrong (a tag created off
  // HEAD, a concurrent run) — not something to paper over.
  execFileSync(
    'gh',
    ghReleaseCreateArgs(tag, targetSha, [
      distLibJsPath,
      distLibDtsPath,
      'LICENSE',
      'NOTICE',
      thirdPartyPath,
      checksumPath,
      dtsChecksumPath,
    ]),
    { stdio: 'inherit' },
  )

  console.log(`Released ${tag}.`)
}
