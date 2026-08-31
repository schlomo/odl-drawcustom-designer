import { execSync } from 'node:child_process'
import { resolveGitBranch, resolveGitPrNumber, resolveGitRevision } from './gitRevision.ts'
import { resolveAppVersion, resolveSiteVersion } from './version.ts'

/**
 * Build-time `define` entries shared by the app build (vite.config.ts) and
 * the library build (vite.lib.config.ts). Every env-derived value keeps the
 * `vitest:` short-circuit guard (AGENTS.md, "Build-time defines") so a
 * GitHub Actions env var can never leak into the Vitest runtime.
 */

const isVitest = Boolean(process.env.VITEST)

function readGitShortHead(): string | undefined {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function readGitBranch(): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function gitRevision(): string {
  return resolveGitRevision({
    vitest: isVitest,
    viteGitRevision: process.env.VITE_GIT_REVISION,
    githubHeadSha: process.env.GITHUB_HEAD_SHA,
    githubSha: process.env.GITHUB_SHA,
    gitShortHead: readGitShortHead(),
  })
}

/**
 * The merge-ref SHA (GITHUB_SHA on PR builds), independent of the PR head
 * preference in `gitRevision()`. Baked separately so the header tooltip can
 * still show it for build honesty even though it's no longer the primary
 * revision label.
 */
function gitMergeRevision(): string {
  return resolveGitRevision({
    vitest: isVitest,
    githubSha: process.env.GITHUB_SHA,
  })
}

function gitBranch(): string {
  return resolveGitBranch({
    vitest: isVitest,
    viteGitBranch: process.env.VITE_GIT_BRANCH,
    githubRefName: process.env.GITHUB_REF_NAME,
    githubHeadRef: process.env.GITHUB_HEAD_REF,
    gitBranch: readGitBranch(),
  })
}

function gitPrNumber(): number {
  return (
    resolveGitPrNumber({
      vitest: isVitest,
      githubRefName: process.env.GITHUB_REF_NAME,
    }) ?? 0
  )
}

/**
 * The designer's runtime version (issue #23, reworked 2026-07-29: git tags
 * are the sole version source, not package.json). `tools/autoRelease.ts`
 * sets `APP_VERSION` in the environment for the release build it triggers;
 * baked in here so a host embedding the library build can log which
 * designer build it's running (`version` export / mount handle field,
 * `src/embed/index.ts`). Absent (local dev, CI `checks`), this falls back
 * to `DEV_APP_VERSION` (`tools/version.ts`).
 */
function appVersion(): string {
  return resolveAppVersion({ vitest: isVitest, envVersion: process.env.APP_VERSION })
}

/**
 * The standalone site header's release-version label (distinct from
 * `appVersion()`/`APP_VERSION` above, which is the *library's* runtime
 * version and always falls back to `0.0.0-dev`). Only the `production` job
 * in `.github/workflows/pages.yml` sets `SITE_VERSION`, computed by
 * `tools/siteVersion.ts` — see docs/releasing.md#site-version. Every other
 * build (local dev, CI `checks`, PR previews, a local `build:site`) has
 * none set and resolves to the empty string, which the header reads as
 * "omit the version, show branch + SHA instead".
 */
function siteVersion(): string {
  return resolveSiteVersion({ vitest: isVitest, envVersion: process.env.SITE_VERSION })
}

export function buildDefines(): Record<string, string> {
  return {
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(gitBranch()),
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(gitRevision()),
    'import.meta.env.VITE_GIT_MERGE_REVISION': JSON.stringify(gitMergeRevision()),
    'import.meta.env.VITE_GIT_PR_NUMBER': JSON.stringify(String(gitPrNumber())),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
    'import.meta.env.VITE_SITE_VERSION': JSON.stringify(siteVersion()),
  }
}
