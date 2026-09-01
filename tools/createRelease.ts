import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeGithubStepSummary } from './npmPublish.ts'
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

/** Reads back just the asset list of a release, as JSON. */
export function ghReleaseViewAssetsArgs(tag: string): string[] {
  return ['release', 'view', tag, '--json', 'assets']
}

/**
 * `gh release upload` args. `--clobber` is deliberate even though the caller
 * only ever passes assets the release is missing: between the read-back and
 * this call a concurrent run could have added one, and converging is better
 * than failing. Safe because the rebuild is byte-reproducible at a fixed
 * `APP_VERSION` (verified: two `build:lib` runs produce identical sha256s)
 * and because `planReleaseReconcile` has already refused to proceed if a
 * checksum on the release disagrees with the fresh build.
 */
export function ghReleaseUploadArgs(tag: string, assetPaths: string[]): string[] {
  return ['release', 'upload', tag, ...assetPaths, '--clobber']
}

/**
 * Every asset a complete GitHub release carries (see
 * docs/releasing.md#artifact-contents). Reconciliation compares the release
 * against exactly this list.
 */
export const RELEASE_ASSET_NAMES = [
  'odl-drawcustom-designer.js',
  'odl-drawcustom-designer.d.ts',
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY.md',
  'odl-drawcustom-designer.js.sha256',
  'odl-drawcustom-designer.d.ts.sha256',
] as const

export type ReconcileDecision =
  | { action: 'complete'; reason: string }
  | { action: 'upload'; assetNames: string[]; reason: string }

export interface PlanReleaseReconcileInput {
  tag: string
  /** What the GitHub release currently is: whether it exists at all, and which assets it carries. */
  release: { exists: boolean; assetNames: string[] }
  /** `<name>.sha256` → its content, freshly built this run. */
  freshChecksums: Record<string, string>
  /** `<name>.sha256` → its content as already published on the release (only for ones present there). */
  recordedChecksums: Record<string, string>
}

/**
 * Decide how to repair an `already-released` tag (Copilot review, PR #183).
 *
 * `gh release create` is **not atomic**: it creates the tag and the release,
 * then uploads the assets one at a time. If an upload dies, the tag exists
 * and is reachable from HEAD, so the next run's `tools/releaseVersion.ts`
 * reports `already-released` — and if this script simply exited there, the
 * GitHub release would stay permanently incomplete while npm and Pages
 * proceeded. npm reconciles itself against the registry; the release needs
 * this.
 *
 * Three deliberate rulings, in order:
 *
 * 1. **"Complete" means every name in `RELEASE_ASSET_NAMES` is present.**
 *    An asset that exists is whole — GitHub's asset upload either completes
 *    or leaves nothing — so presence is a sound completeness test.
 * 2. **A present checksum must MATCH the fresh build, or this throws.**
 *    `build:lib` is byte-reproducible at a fixed `APP_VERSION`, so a
 *    disagreement is a real anomaly (a different toolchain, a tag moved off
 *    its commit, a hand-edited asset) and must be seen, not clobbered over
 *    bytes a consumer may already have downloaded and checksummed. Checking
 *    the two tiny `.sha256` files covers the two big binaries without
 *    downloading them.
 * 3. **A tag with no release fails loudly.** This pipeline cannot produce
 *    that state (`gh release create` makes both together), so it means the
 *    release was deleted outside it. Recreating it would regenerate notes
 *    over a range someone deliberately changed and would quietly undo a
 *    destructive action; AGENTS.md is explicit that releases exist because
 *    the maintainer decided so. The fix is a human one, named in the error.
 *
 * Idempotent: run it twice and the second run finds everything present and
 * matching, and does nothing.
 */
export function planReleaseReconcile(input: PlanReleaseReconcileInput): ReconcileDecision {
  const { tag, release, freshChecksums, recordedChecksums } = input

  if (!release.exists) {
    throw new Error(
      `Tag ${tag} exists but there is no GitHub release for it. This pipeline always creates both together, ` +
        `so the release was deleted outside it — refusing to recreate it (that would regenerate release notes ` +
        `over a deliberately changed range). Recreate it by hand, or delete the tag to let the next push ` +
        `release that version again.`,
    )
  }

  for (const [name, fresh] of Object.entries(freshChecksums)) {
    const recorded = recordedChecksums[name]
    if (recorded !== undefined && recorded.trim() !== fresh.trim()) {
      throw new Error(
        `Release ${tag}'s ${name} does not match this run's freshly built checksum — the release asset says ` +
          `"${recorded.trim()}" but the rebuild produced "${fresh.trim()}". build:lib is byte-reproducible at a ` +
          `fixed APP_VERSION, so this is a real anomaly (a moved tag, a different toolchain, a hand-edited ` +
          `asset). Refusing to overwrite published bytes — investigate before retrying.`,
      )
    }
  }

  const present = new Set(release.assetNames)
  const missing = RELEASE_ASSET_NAMES.filter((name) => !present.has(name))

  if (missing.length === 0) {
    return { action: 'complete', reason: `${tag} already carries all ${RELEASE_ASSET_NAMES.length} release assets` }
  }

  return {
    action: 'upload',
    assetNames: missing,
    reason: `${tag} is missing ${missing.length} of ${RELEASE_ASSET_NAMES.length} release assets: ${missing.join(', ')}`,
  }
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

  // Absolute paths keyed by the asset NAME the release carries them under,
  // so reconciliation can turn "these names are missing" into "upload these
  // files" without a second, drift-prone list.
  const assetPathsByName: Record<string, string> = {
    'odl-drawcustom-designer.js': distLibJsPath,
    'odl-drawcustom-designer.d.ts': distLibDtsPath,
    LICENSE: join(repoRoot, 'LICENSE'),
    NOTICE: join(repoRoot, 'NOTICE'),
    'THIRD_PARTY.md': thirdPartyPath,
    'odl-drawcustom-designer.js.sha256': checksumPath,
    'odl-drawcustom-designer.d.ts.sha256': dtsChecksumPath,
  }

  if (!createRelease) {
    // `already-released` (tools/releaseVersion.ts): HEAD is this tag. NOT a
    // plain exit — `gh release create` is not atomic (it creates the tag,
    // then uploads assets one by one), so a run that died mid-upload leaves
    // a tag whose release is incomplete, and every later run would classify
    // it as already-released. Reconcile instead: read back what the release
    // carries and upload whatever is missing. See planReleaseReconcile above
    // for the three rulings this implements.
    console.log(`${tag} is already released — reconciling its assets...`)

    let releaseAssetNames: string[] = []
    let releaseExists = true
    try {
      const viewed = JSON.parse(
        execFileSync('gh', ghReleaseViewAssetsArgs(tag), { encoding: 'utf8' }),
      ) as { assets?: { name: string }[] }
      releaseAssetNames = (viewed.assets ?? []).map((asset) => asset.name)
    } catch {
      // `gh release view` exits non-zero when there is no release for the
      // tag. Any other failure (auth, network) also lands here, so the
      // thrown message below names both possibilities rather than asserting
      // a deletion it cannot actually distinguish.
      releaseExists = false
    }

    // Only the checksum files are compared — they are tiny, and their
    // contents ARE the digests of the two big binaries, so this verifies
    // those without downloading 5.7 MB of release assets.
    const checksumAssetNames = ['odl-drawcustom-designer.js.sha256', 'odl-drawcustom-designer.d.ts.sha256']
    const freshChecksums: Record<string, string> = {}
    const recordedChecksums: Record<string, string> = {}
    const recordedDir = mkdtempSync(join(tmpdir(), 'release-reconcile-'))
    for (const name of checksumAssetNames) {
      freshChecksums[name] = readFileSync(assetPathsByName[name]!, 'utf8')
      if (!releaseAssetNames.includes(name)) {
        continue
      }
      execFileSync('gh', ['release', 'download', tag, '--pattern', name, '--dir', recordedDir, '--clobber'], {
        stdio: 'inherit',
      })
      recordedChecksums[name] = readFileSync(join(recordedDir, name), 'utf8')
    }

    const reconcile = planReleaseReconcile({
      tag,
      release: { exists: releaseExists, assetNames: releaseAssetNames },
      freshChecksums,
      recordedChecksums,
    })

    if (reconcile.action === 'complete') {
      console.log(reconcile.reason)
      process.exit(0)
    }

    console.warn(`Repairing an incomplete release: ${reconcile.reason}`)
    execFileSync('gh', ghReleaseUploadArgs(tag, reconcile.assetNames.map((name) => assetPathsByName[name]!)), {
      stdio: 'inherit',
    })
    writeGithubStepSummary(
      process.env,
      `## 🩹 Repaired an incomplete GitHub release\n\n${reconcile.reason}\n\n` +
        `A previous run created ${tag} but did not finish uploading its assets (\`gh release create\` is not ` +
        `atomic). The missing assets have now been uploaded — see docs/releasing.md#failure-and-recovery.\n`,
    )
    console.log(`Reconciled ${tag}.`)
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
