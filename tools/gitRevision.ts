export interface GitRevisionSource {
  vitest?: boolean
  viteGitRevision?: string
  githubSha?: string
  gitShortHead?: string
}

export interface GitBranchSource {
  vitest?: boolean
  viteGitBranch?: string
  githubRefName?: string
  /** GITHUB_HEAD_REF — the real source-branch name on pull-request builds. */
  githubHeadRef?: string
  gitBranch?: string
}

/** Resolve a 7-character Git revision label for build metadata. */
export function resolveGitRevision(source: GitRevisionSource = {}): string {
  if (source.vitest) {
    return 'test'
  }
  const fromEnv = source.viteGitRevision?.trim()
  if (fromEnv) {
    return fromEnv.length > 7 ? fromEnv.slice(0, 7) : fromEnv
  }
  if (source.githubSha) {
    return source.githubSha.slice(0, 7)
  }
  const shortHead = source.gitShortHead?.trim()
  if (shortHead) {
    return shortHead
  }
  return 'dev'
}

/** Resolve the Git branch label for build metadata. */
export function resolveGitBranch(source: GitBranchSource = {}): string {
  if (source.vitest) {
    return 'test'
  }
  const fromEnv = source.viteGitBranch?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const refName = source.githubRefName?.trim()
  if (refName) {
    // GitHub sets GITHUB_REF_NAME to "<n>/merge" for pull-request builds.
    // Prefer the real source-branch name (GITHUB_HEAD_REF) when available.
    if (/^\d+\/merge$/.test(refName)) {
      const headRef = source.githubHeadRef?.trim()
      if (headRef) {
        return headRef
      }
    }
    return refName
  }
  const branch = source.gitBranch?.trim()
  if (branch) {
    return branch
  }
  return 'dev'
}

export interface GitPrNumberSource {
  vitest?: boolean
  githubRefName?: string
}

/**
 * Extract the pull-request number from a GitHub merge ref (e.g. `"11/merge"` → `11`).
 * Returns `undefined` when the ref is not a PR merge ref, or when running under Vitest.
 */
export function resolveGitPrNumber(source: GitPrNumberSource = {}): number | undefined {
  if (source.vitest) {
    return undefined
  }
  const match = /^(\d+)\/merge$/.exec(source.githubRefName?.trim() ?? '')
  return match ? Number(match[1]) : undefined
}
