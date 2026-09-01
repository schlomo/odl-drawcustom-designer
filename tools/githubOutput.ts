import { appendFileSync } from 'node:fs'

/**
 * GitHub Actions step outputs (`$GITHUB_OUTPUT`) — the one channel the
 * release pipeline's `version` job uses to hand the computed version to the
 * two publish jobs that fan out from it (docs/releasing.md). Kept here as a
 * tested helper rather than an `echo "k=v" >> "$GITHUB_OUTPUT"` line in the
 * workflow, so the escaping rule below lives in code (thin CI, AGENTS.md).
 *
 * Writing the file is a no-op when `GITHUB_OUTPUT` is unset, so every script
 * that emits outputs still runs unchanged on a laptop (AGENTS.md, "runs on
 * laptop or CI identically") — it just prints to stdout and writes nothing.
 */

/** Actions' heredoc delimiter. Any value containing it would break the file, so it is rejected. */
const DELIMITER = 'ghadelimiter_9c1f4c2e'

/**
 * Render `outputs` as `$GITHUB_OUTPUT` lines. Every value uses the heredoc
 * form, not `key=value`: a value with a newline in it silently truncates (or
 * worse, injects further outputs) in the plain form, and this pipeline's
 * values reach the file from git data.
 */
export function formatGithubOutputLines(outputs: Record<string, string>): string {
  return Object.entries(outputs)
    .map(([key, value]) => {
      if (value.includes(DELIMITER)) {
        throw new Error(`Output "${key}" contains the reserved GitHub Actions delimiter — refusing to write it`)
      }
      return `${key}<<${DELIMITER}\n${value}\n${DELIMITER}\n`
    })
    .join('')
}

/** Append `outputs` to `$GITHUB_OUTPUT` when running in GitHub Actions; a no-op otherwise. */
export function writeGithubOutput(env: NodeJS.ProcessEnv, outputs: Record<string, string>): void {
  const outputPath = env.GITHUB_OUTPUT
  if (!outputPath) {
    return
  }
  appendFileSync(outputPath, formatGithubOutputLines(outputs))
}
