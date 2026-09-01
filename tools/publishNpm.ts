import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NPM_PACKAGE_NAME } from './npmPackage.ts'
import { NPM_PUBLISH_SKIP_MESSAGE, shouldPublishToNpm, writeGithubStepSummary } from './npmPublish.ts'
import { checkNpmRegistryHasVersion, planNpmPublish } from './npmPublishPlan.ts'
import { stageNpmPackage } from './stageNpmPackage.ts'

/**
 * The npm half of the release pipeline's fan-out
 * (`.github/workflows/auto-release.yml`'s `npm` job, docs/releasing.md).
 * It runs in PARALLEL with the GitHub Pages deploy and independently of it
 * (maintainer ruling 2026-09-01: "each has its own value and a failure
 * doesn't demote the other"), consuming the version the `version` job
 * already computed and released.
 *
 * It publishes the EXACT bytes attached to the GitHub release, fetched from
 * the release itself with `gh release download` — so the release's `.sha256`
 * assets describe the npm tarball's contents by construction, and there is
 * nothing to rebuild here.
 *
 * The release, not a workflow artifact, is deliberately the source. An
 * earlier draft had the `version` job hand `dist-lib/` over as an
 * `actions/upload-artifact` artifact, but artifacts are scoped to a workflow
 * run and their visibility across RUN ATTEMPTS is not something the action's
 * docs pin down — and "re-run the failed npm job alone" (attempt 2 running
 * `npm` while `version` stays green from attempt 1) is precisely this
 * pipeline's headline recovery path. Reading the release removes that
 * doubt entirely: by the time this job runs the release exists, complete
 * (tools/createRelease.ts reconciles it), and it outlives artifact
 * retention.
 *
 * Idempotent by construction: it asks the registry whether this version is
 * already published and skips cleanly if so. That is what makes "re-run the
 * failed npm job" the recovery path for a publish that died after the
 * GitHub release was already created (AGENTS.md, "re-running is the upgrade
 * path") — there is no separate recovery mode to maintain.
 */

const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/

/** The release assets this package is staged from. */
export const NPM_SOURCE_ASSET_NAMES = [
  'odl-drawcustom-designer.js',
  'odl-drawcustom-designer.d.ts',
  'THIRD_PARTY.md',
] as const

/**
 * `gh release download` args for exactly the assets staging needs.
 * `--clobber` keeps a re-run from failing on files a previous attempt left
 * in the directory; the per-asset `--pattern` list avoids pulling LICENSE
 * and NOTICE, which are staged from the checkout, and the two `.sha256`
 * files, which the npm tarball does not ship.
 */
export function ghReleaseDownloadArgs(tag: string, dir: string): string[] {
  return [
    'release',
    'download',
    tag,
    ...NPM_SOURCE_ASSET_NAMES.flatMap((name) => ['--pattern', name]),
    '--dir',
    dir,
    '--clobber',
  ]
}

/** The version to publish, from the `version` job's output. Fails loudly rather than guessing. */
export function requirePublishVersion(env: NodeJS.ProcessEnv): string {
  const version = env.APP_VERSION?.trim()
  if (!version || !PLAIN_SEMVER.test(version)) {
    throw new Error(
      `APP_VERSION must be a plain X.Y.Z version computed by tools/releaseVersion.ts — got ${JSON.stringify(env.APP_VERSION ?? null)}`,
    )
  }
  return version
}

if (import.meta.main) {
  const version = requirePublishVersion(process.env)
  const tag = `v${version}`

  // The gate stays a warn-and-continue exception (issue #103,
  // docs/releasing.md#npm): until a trusted publisher is configured, the
  // GitHub release and the Pages deploy still stand on their own.
  const npmPublishEnabled = shouldPublishToNpm(process.env)
  const npmHasVersion = npmPublishEnabled ? await checkNpmRegistryHasVersion(NPM_PACKAGE_NAME, version) : false
  const decision = planNpmPublish({ version, npmPublishEnabled, npmHasVersion })

  if (decision.action === 'skip') {
    console.log(`npm publish skipped: ${decision.reason}`)
    if (!npmPublishEnabled) {
      writeGithubStepSummary(
        process.env,
        `## ⚠️ npm publish skipped\n\n${NPM_PUBLISH_SKIP_MESSAGE}\n\n` +
          `GitHub release ${tag} is unaffected. Set the \`NPM_PUBLISH\` repository variable to \`enabled\` ` +
          `(after claiming the name and configuring a trusted publisher) to enable npm publishing — ` +
          `see docs/releasing.md#npm.\n`,
      )
    }
    process.exit(0)
  }

  const repoRoot = process.cwd()
  const distLibDir = join(repoRoot, 'dist-lib')
  const stagingDir = join(repoRoot, 'dist-npm')

  // The published bytes come from the GitHub release itself, so they cannot
  // drift from what the release's checksums describe.
  mkdirSync(distLibDir, { recursive: true })
  console.log(`Fetching ${tag}'s release assets...`)
  execFileSync('gh', ghReleaseDownloadArgs(tag, distLibDir), { stdio: 'inherit' })
  stageNpmPackage({
    version,
    repoRoot,
    distLibJsPath: join(distLibDir, 'odl-drawcustom-designer.js'),
    distLibDtsPath: join(distLibDir, 'odl-drawcustom-designer.d.ts'),
    stagingDir,
    // Downloaded from the release alongside the ESM — regenerating it here
    // could only ever disagree with the copy the release publishes.
    thirdPartyMarkdown: readFileSync(join(distLibDir, 'THIRD_PARTY.md'), 'utf8'),
  })

  // Trusted Publishing (OIDC) needs no token — the workflow's
  // `id-token: write` permission plus a trusted publisher configured on
  // npmjs.com for this repo/workflow FILENAME is what authenticates this.
  // `--provenance` stays explicit as belt-and-suspenders; `--access public`
  // is mandatory for a scoped package. Fails loudly on any error.
  console.log(`${decision.reason} — publishing ${NPM_PACKAGE_NAME}@${version}...`)
  execFileSync('npm', ['publish', '--access', 'public', '--provenance'], { stdio: 'inherit', cwd: stagingDir })
  console.log(`Published ${tag} to npm.`)
}
