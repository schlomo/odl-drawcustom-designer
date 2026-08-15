import { appendFileSync } from 'node:fs'

/**
 * npm-publish rollout gating (issue #103). `NPM_TOKEN` does not exist as a
 * repository secret yet — this is a deliberate staged rollout: the workflow
 * step checks for it and, when absent, emits a prominent job-summary warning
 * plus this log line, then CONTINUES the GitHub release (does not fail the
 * run). Once present, a failed `npm publish` must fail the run loudly — the
 * one documented exception to "fail early and loudly" (AGENTS.md) is the
 * missing-secret case itself, not publish failures once the secret exists.
 */

export const NPM_TOKEN_SKIP_MESSAGE =
  'NPM_TOKEN not configured — npm publish skipped (docs/releasing.md#npm)'

/** Whether an npm publish should be attempted at all — NPM_TOKEN present and non-blank. */
export function shouldPublishToNpm(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.NPM_TOKEN?.trim())
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
