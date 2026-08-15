import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NPM_TOKEN_SKIP_MESSAGE, shouldPublishToNpm, writeGithubStepSummary } from '../../tools/npmPublish'

// Staged npm-publish rollout (issue #103): NPM_TOKEN does not exist as a repo
// secret yet. The workflow step must check for it and, when absent, emit a
// prominent job-summary warning + log line and continue the GitHub release
// (never fail the run for a missing token); when present but publish fails,
// fail the run loudly (AGENTS.md: fail early and loudly is the default, this
// is the one documented deliberate exception).

describe('shouldPublishToNpm', () => {
  it('is false when NPM_TOKEN is absent', () => {
    expect(shouldPublishToNpm({})).toBe(false)
  })

  it('is false when NPM_TOKEN is empty/whitespace', () => {
    expect(shouldPublishToNpm({ NPM_TOKEN: '   ' })).toBe(false)
  })

  it('is true when NPM_TOKEN is set', () => {
    expect(shouldPublishToNpm({ NPM_TOKEN: 'npm_abc123' })).toBe(true)
  })
})

describe('NPM_TOKEN_SKIP_MESSAGE', () => {
  it('names the exact skip reason and points at the docs', () => {
    expect(NPM_TOKEN_SKIP_MESSAGE).toBe(
      'NPM_TOKEN not configured — npm publish skipped (docs/releasing.md#npm)',
    )
  })
})

describe('writeGithubStepSummary', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('appends markdown to the file at GITHUB_STEP_SUMMARY when set', () => {
    dir = mkdtempSync(join(tmpdir(), 'step-summary-test-'))
    const summaryPath = join(dir, 'summary.md')
    writeFileSync(summaryPath, '# Existing\n')

    writeGithubStepSummary({ GITHUB_STEP_SUMMARY: summaryPath }, '## npm publish skipped\n')

    expect(readFileSync(summaryPath, 'utf8')).toBe('# Existing\n## npm publish skipped\n')
  })

  it('is a silent no-op when GITHUB_STEP_SUMMARY is not set (local/manual runs)', () => {
    expect(() => writeGithubStepSummary({}, '## should not throw\n')).not.toThrow()
  })
})
