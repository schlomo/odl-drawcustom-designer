import { APP_GITHUB_REPO_URL } from './brand'

const DEV_LABELS = new Set(['dev', 'test'])

/** Git branch baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_BRANCH =
  (import.meta.env.VITE_GIT_BRANCH ?? 'dev').trim() || 'dev'

/** Git revision baked in at build time (`vite.config.ts` / CI). */
export const APP_GIT_REVISION =
  (import.meta.env.VITE_GIT_REVISION ?? 'dev').trim() || 'dev'

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

/** Link to the branch tree (or `main` history for local dev). */
export function githubBranchUrl(branch = APP_GIT_BRANCH): string {
  const repoBase = APP_GITHUB_REPO_URL.replace(/\/$/, '')
  if (DEV_LABELS.has(branch)) {
    return `${repoBase}/commits/main`
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
