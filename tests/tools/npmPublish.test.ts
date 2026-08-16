import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NPM_PUBLISH_SKIP_MESSAGE, shouldPublishToNpm, writeGithubStepSummary } from '../../tools/npmPublish'

// npm-publish rollout gating (issue #103, reworked to Trusted Publishing
// (OIDC) per maintainer ruling 2026-08-16 — npmjs refuses classic automation
// tokens without 2FA). There is no token secret to gate on any more: a repo
// **variable**, `vars.NPM_PUBLISH`, decides skip-vs-publish for the same
// staged-rollout reason (maintainer hasn't claimed the npm name /
// configured the trusted publisher yet). The workflow step must check for
// it and, when not exactly "enabled", emit a prominent job-summary warning +
// log line and continue the GitHub release (never fail the run for the gate
// being off); when enabled and publish fails (e.g. the trusted publisher
// isn't configured on npmjs yet), fail the run loudly (AGENTS.md: fail
// early and loudly is the default, this is the one documented deliberate
// exception).

describe('shouldPublishToNpm', () => {
  it('is false when NPM_PUBLISH is absent', () => {
    expect(shouldPublishToNpm({})).toBe(false)
  })

  it('is false when NPM_PUBLISH is empty/whitespace', () => {
    expect(shouldPublishToNpm({ NPM_PUBLISH: '   ' })).toBe(false)
  })

  it('is false when NPM_PUBLISH is any value other than exactly "enabled"', () => {
    expect(shouldPublishToNpm({ NPM_PUBLISH: 'disabled' })).toBe(false)
    expect(shouldPublishToNpm({ NPM_PUBLISH: 'true' })).toBe(false)
    expect(shouldPublishToNpm({ NPM_PUBLISH: 'Enabled' })).toBe(false)
  })

  it('is true when NPM_PUBLISH is exactly "enabled"', () => {
    expect(shouldPublishToNpm({ NPM_PUBLISH: 'enabled' })).toBe(true)
  })

  it('tolerates surrounding whitespace on "enabled"', () => {
    expect(shouldPublishToNpm({ NPM_PUBLISH: '  enabled  ' })).toBe(true)
  })
})

describe('NPM_PUBLISH_SKIP_MESSAGE', () => {
  it('names the exact skip reason and points at the docs', () => {
    expect(NPM_PUBLISH_SKIP_MESSAGE).toBe(
      'NPM_PUBLISH repo variable not enabled — npm publish skipped (docs/releasing.md#npm)',
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
