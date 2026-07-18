import { APP_GITHUB_REPO_URL } from './brand'

const DEV_LABELS = new Set(['dev', 'test'])

/** Git branch baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_BRANCH =
  (import.meta.env.VITE_GIT_BRANCH ?? 'dev').trim() || 'dev'

/** Git revision baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_REVISION =
  (import.meta.env.VITE_GIT_REVISION ?? 'dev').trim() || 'dev'

/**
 * Merge-ref SHA baked in at build time (`vite.config.ts` / CI). On PR preview
 * builds this is GITHUB_SHA — the synthetic merge commit GitHub builds for
 * `pull_request` events, which exists on no branch. `APP_GIT_REVISION` shows
 * the PR head SHA instead (see ADR history / tools/gitRevision.ts); this
 * value is kept around so the header tooltip can still disclose it for
 * build honesty.
 */
export const APP_GIT_MERGE_REVISION =
  (import.meta.env.VITE_GIT_MERGE_REVISION ?? 'dev').trim() || 'dev'

/**
 * Pull-request number baked in at build time (`vite.config.ts` / CI).
 * `0` means this is not a PR preview build.
 */
export const APP_GIT_PR_NUMBER: number =
  Number(import.meta.env.VITE_GIT_PR_NUMBER ?? '0') || 0

/**
 * Optional HTML for a second header line (e.g. Impressum / Datenschutz links).
 * Set at build time via `VITE_HEADER_LEGAL_HTML`; trusted content only.
 */
export const APP_HEADER_LEGAL_HTML =
  (import.meta.env.VITE_HEADER_LEGAL_HTML ?? '').trim()

/** Compact branch label for the header (leaf segment, truncated when long). */
export function formatGitBranchLabel(branch: string, maxLen = 12): string {
  if (DEV_LABELS.has(branch) || branch.length <= maxLen) {
    return branch
  }
  const leaf = branch.includes('/') ? branch.slice(branch.lastIndexOf('/') + 1) : branch
  if (leaf.length <= maxLen) {
    return leaf
  }
  return `${leaf.slice(0, maxLen - 1)}…`
}

/** Compact revision label for the header (7-char SHA when applicable). */
export function formatGitRevisionLabel(revision: string): string {
  if (DEV_LABELS.has(revision) || revision.length <= 7) {
    return revision
  }
  if (/^[0-9a-f]+$/i.test(revision)) {
    return revision.slice(0, 7)
  }
  return revision.length > 12 ? `${revision.slice(0, 11)}…` : revision
}

/**
 * Tooltip text for the revision link. Shows only the displayed revision
 * (the PR head SHA on preview builds), plus the merge SHA when it differs
 * and isn't a dev/test placeholder — build honesty without confusing the
 * primary label.
 */
export function formatRevisionTooltip(
  revision = APP_GIT_REVISION,
  mergeRevision = APP_GIT_MERGE_REVISION,
): string {
  if (mergeRevision === revision || DEV_LABELS.has(mergeRevision)) {
    return `Revision: ${revision}`
  }
  return `Revision: ${revision} · built from merge ${formatGitRevisionLabel(mergeRevision)}`
}

/** Link to the branch tree (or PR page for PR preview builds, or `main` history for local dev). */
export function githubBranchUrl(branch = APP_GIT_BRANCH, prNumber = APP_GIT_PR_NUMBER): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  if (DEV_LABELS.has(branch)) {
    return `${repoBase}/commits/main`
  }
  if (prNumber > 0) {
    return `${repoBase}/pull/${prNumber}`
  }
  return `${repoBase}/tree/${encodeURIComponent(branch)}`
}

/** Link to the commit this build was produced from (or `main` for local dev). */
export function githubCommitUrl(revision = APP_GIT_REVISION): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  if (DEV_LABELS.has(revision)) {
    return `${repoBase}/commits/main`
  }
  return `${repoBase}/commit/${revision}`
}
