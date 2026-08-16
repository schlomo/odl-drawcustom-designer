import { appendFileSync } from 'node:fs'

/**
 * npm-publish rollout gating (issue #103, reworked to Trusted Publishing
 * (OIDC) per maintainer ruling 2026-08-16 — npmjs now refuses classic
 * automation tokens without 2FA and points integrators at Trusted
 * Publishing instead, so there is no npm access-token secret to manage or
 * gate on). The gate is a repository **variable**, `vars.NPM_PUBLISH`: until the
 * maintainer has claimed the npm package name (first publish must be
 * manual — see docs/releasing.md#npm) and configured a trusted publisher
 * for this repo/workflow on npmjs.com, the variable stays unset and this is
 * a deliberate staged rollout — the workflow step checks for it and, when
 * not exactly `"enabled"`, emits a prominent job-summary warning plus this
 * log line, then CONTINUES the GitHub release (does not fail the run). Once
 * enabled, a failed `npm publish` must fail the run loudly — the one
 * documented "fail early and loudly" exception (AGENTS.md) is the
 * gate-disabled case itself, not publish failures once it's on.
 */

export const NPM_PUBLISH_SKIP_MESSAGE =
  'NPM_PUBLISH repo variable not enabled — npm publish skipped (docs/releasing.md#npm)'

/** Whether an npm publish should be attempted at all — `NPM_PUBLISH` is exactly `"enabled"` (trimmed). */
export function shouldPublishToNpm(env: NodeJS.ProcessEnv): boolean {
  return env.NPM_PUBLISH?.trim() === 'enabled'
}

/**
 * Appends markdown to the GitHub Actions step summary file when running in
 * CI (`GITHUB_STEP_SUMMARY` set); a silent no-op for local/manual runs where
 * it's unset, so the same script works on a laptop and in CI (AGENTS.md,
 * "runs on laptop or CI identically").
 */
export function writeGithubStepSummary(env: NodeJS.ProcessEnv, markdown: string): void {
  const summaryPath = env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    return
  }
  appendFileSync(summaryPath, markdown)
}
