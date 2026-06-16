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
  if (source.githubRefName?.trim()) {
    return source.githubRefName.trim()
  }
  const branch = source.gitBranch?.trim()
  if (branch) {
    return branch
  }
  return 'dev'
}
