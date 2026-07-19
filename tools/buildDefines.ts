import { execSync } from 'node:child_process'
import { resolveGitBranch, resolveGitPrNumber, resolveGitRevision } from './gitRevision.ts'

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

export function gitBuildDefines(): Record<string, string> {
  return {
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(gitBranch()),
    'import.meta.env.VITE_GIT_REVISION': JSON.stringify(gitRevision()),
    'import.meta.env.VITE_GIT_MERGE_REVISION': JSON.stringify(gitMergeRevision()),
    'import.meta.env.VITE_GIT_PR_NUMBER': JSON.stringify(String(gitPrNumber())),
  }
}
