import { describe, expect, it } from 'vitest'
import {
  applyBump,
  bumpForCommit,
  gitTagListArgs,
  maxBump,
  parseCommitMessages,
  planRelease,
  versionFromTag,
} from '../../tools/releaseVersion'

// The version a push to main releases, computed ONCE up front (maintainer
// ruling 2026-09-01) and consumed by both publish jobs that fan out from it
// (.github/workflows/auto-release.yml, docs/releasing.md). Every decision
// lives here as a pure function (thin CI, AGENTS.md); the CLI entry point
// (`import.meta.main` in tools/releaseVersion.ts) only reads git and emits
// the value, exercised by the workflow itself, not by these tests.

describe('bumpForCommit', () => {
  it('bumps minor for a feat: commit', () => {
    expect(bumpForCommit('feat: add drag handles')).toBe('minor')
  })

  it('bumps patch for a fix: commit', () => {
    expect(bumpForCommit('fix: correct anchor math')).toBe('patch')
  })

  it('bumps patch for a chore: commit', () => {
    expect(bumpForCommit('chore: tidy imports')).toBe('patch')
  })

  it('bumps patch for a build(deps): commit (dependabot)', () => {
    expect(bumpForCommit('build(deps): bump vite from 8.1.4 to 8.1.5')).toBe('patch')
  })

  it('bumps patch for a commit with no conventional prefix', () => {
    expect(bumpForCommit('Update README')).toBe('patch')
  })

  // "Every push to main bumps at least a patch" (maintainer ruling
  // 2026-09-01) — the non-code commit types are the whole point of the rule.
  it('bumps patch for a docs: commit', () => {
    expect(bumpForCommit('docs: rewrite the releasing guide')).toBe('patch')
  })

  it('bumps patch for a revert', () => {
    expect(bumpForCommit('Revert "feat: add drag handles"\n\nThis reverts commit abc1234.')).toBe('patch')
  })

  it('bumps patch for a style:/refactor:/test: commit', () => {
    expect(bumpForCommit('style: reformat')).toBe('patch')
    expect(bumpForCommit('refactor: extract a helper')).toBe('patch')
    expect(bumpForCommit('test: cover the edge case')).toBe('patch')
  })

  it('never returns anything below patch, for any commit shape', () => {
    const shapes = ['docs: x', 'chore: x', 'ci: x', 'Merge pull request #1 from a/b', '', '   ']
    for (const shape of shapes) {
      expect(bumpForCommit(shape)).toBe('patch')
    }
  })

  it('bumps major for feat!: (bang after type)', () => {
    expect(bumpForCommit('feat!: drop legacy mount option')).toBe('major')
  })

  it('bumps major for any type with a bang, not just feat', () => {
    expect(bumpForCommit('chore!: remove deprecated script')).toBe('major')
  })

  it('bumps major for a bang with a scope: fix(embed)!:', () => {
    expect(bumpForCommit('fix(embed)!: change mount() return shape')).toBe('major')
  })

  it('bumps major when the body has a BREAKING CHANGE footer', () => {
    const message = 'feat: add theme option\n\nBREAKING CHANGE: removes the old palette export'
    expect(bumpForCommit(message)).toBe('major')
  })

  it('only inspects the subject line, not unrelated body text, for the type/bang', () => {
    // A "!" appearing in the body (not the subject) must not force major.
    expect(bumpForCommit('fix: handle edge case\n\nnote: important!')).toBe('patch')
  })

  it('bumps minor for a capitalized Feat: commit (type match is case-insensitive)', () => {
    expect(bumpForCommit('Feat: add drag handles')).toBe('minor')
  })

  it('bumps major for a capitalized FIX!: commit (bang match is case-insensitive on type)', () => {
    expect(bumpForCommit('FIX!: change mount() return shape')).toBe('major')
  })

  it('does not treat a quoted "BREAKING CHANGE:" mid-line in the body as a real footer', () => {
    // GitHub squash-merge bodies concatenate sub-commit lines; a sentence
    // that merely quotes the phrase (not at the start of a line) must not
    // force a false major bump.
    const message =
      'fix: handle edge case\n\n' +
      'Someone said quoting "BREAKING CHANGE:" in a commit message is scary, but this is just a fix.'
    expect(bumpForCommit(message)).toBe('patch')
  })

  it('bumps major for a genuine BREAKING CHANGE footer at the start of a line', () => {
    const message = 'fix: change mount option\n\nBREAKING CHANGE: removes the old palette export'
    expect(bumpForCommit(message)).toBe('major')
  })
})

describe('maxBump', () => {
  it('returns undefined for an empty list (nothing to release)', () => {
    expect(maxBump([])).toBeUndefined()
  })

  it('returns the only bump for a single-element list', () => {
    expect(maxBump(['patch'])).toBe('patch')
  })

  it('takes the max across mixed bumps: minor beats patch', () => {
    expect(maxBump(['patch', 'minor', 'patch'])).toBe('minor')
  })

  it('takes the max across mixed bumps: major beats everything', () => {
    expect(maxBump(['minor', 'patch', 'major', 'minor'])).toBe('major')
  })
})

describe('applyBump', () => {
  it('bumps patch', () => {
    expect(applyBump('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('bumps minor and resets patch', () => {
    expect(applyBump('1.2.3', 'minor')).toBe('1.3.0')
  })

  it('bumps major and resets minor+patch', () => {
    expect(applyBump('1.2.3', 'major')).toBe('2.0.0')
  })

  it('throws loudly on a non-plain-semver version', () => {
    expect(() => applyBump('1.2.3-beta.1', 'patch')).toThrow(/semver/)
  })
})

describe('parseCommitMessages', () => {
  it('splits NUL-separated full commit messages from git log --format=%B%x00', () => {
    const raw = 'feat: add drag handles\n\0fix: correct anchor math\n\0'
    expect(parseCommitMessages(raw)).toEqual(['feat: add drag handles', 'fix: correct anchor math'])
  })

  it('drops empty entries (trailing separator, blank commits)', () => {
    const raw = 'feat: a\n\0\0  \0fix: b\n\0'
    expect(parseCommitMessages(raw)).toEqual(['feat: a', 'fix: b'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseCommitMessages('')).toEqual([])
  })
})

describe('versionFromTag', () => {
  it('extracts the semver from a vX.Y.Z tag', () => {
    expect(versionFromTag('v1.2.3')).toBe('1.2.3')
  })

  it('rejects a tag without the v prefix', () => {
    expect(() => versionFromTag('1.2.3')).toThrow(/vX\.Y\.Z/)
  })

  it('rejects a tag with a pre-release/build suffix', () => {
    expect(() => versionFromTag('v1.2.3-beta.1')).toThrow(/vX\.Y\.Z/)
  })

  it('rejects a completely malformed tag', () => {
    expect(() => versionFromTag('release-2026')).toThrow(/vX\.Y\.Z/)
  })
})

describe('gitTagListArgs', () => {
  it('requires ancestry (--merged HEAD) so a stray tag on an unmerged branch is never the base', () => {
    const args = gitTagListArgs()
    const mergedIndex = args.indexOf('--merged')
    expect(mergedIndex).toBeGreaterThan(-1)
    expect(args[mergedIndex + 1]).toBe('HEAD')
  })

  it('lists only vX.Y.Z tags, sorted newest-first', () => {
    expect(gitTagListArgs()).toEqual(['tag', '--list', 'v*.*.*', '--merged', 'HEAD', '--sort=-v:refname'])
  })
})

describe('planRelease', () => {
  it('first release: no tag reachable from HEAD yet releases v1.0.0', () => {
    const plan = planRelease({ latestTag: undefined, commitMessagesSinceTag: [] })
    expect(plan).toMatchObject({ mode: 'first-release', version: '1.0.0', tag: 'v1.0.0', createRelease: true })
  })

  it('first release ignores any commits since there is no tag to diff against', () => {
    const plan = planRelease({ latestTag: undefined, commitMessagesSinceTag: ['feat: whatever'] })
    expect(plan).toMatchObject({ mode: 'first-release', version: '1.0.0', createRelease: true })
  })

  it('bumps from the tag version when commits exist since the last tag', () => {
    const plan = planRelease({
      latestTag: 'v1.2.3',
      commitMessagesSinceTag: ['feat: add drag handles'],
    })
    expect(plan).toMatchObject({ mode: 'bump', version: '1.3.0', tag: 'v1.3.0', bump: 'minor', createRelease: true })
  })

  it('takes the max bump across all commits since the last tag', () => {
    const plan = planRelease({
      latestTag: 'v1.0.0',
      commitMessagesSinceTag: ['fix: small tweak', 'feat: new option', 'chore: cleanup'],
    })
    expect(plan).toMatchObject({ mode: 'bump', version: '1.1.0', bump: 'minor', createRelease: true })
  })

  it('fails loudly when the latest tag is malformed', () => {
    expect(() =>
      planRelease({
        latestTag: 'release-2026',
        commitMessagesSinceTag: ['fix: small tweak'],
      }),
    ).toThrow(/vX\.Y\.Z/)
  })

  // Maintainer ruling (2026-09-01): EVERY push to main releases at least a
  // patch — "non-code pushes should bump patch IMHO, why not? more
  // consistent and doesn't cost". There is no commit shape that reaches
  // main and produces no release.
  it('releases a patch for a docs-only push', () => {
    const plan = planRelease({ latestTag: 'v3.3.0', commitMessagesSinceTag: ['docs: clarify the embed contract'] })
    expect(plan).toMatchObject({ mode: 'bump', version: '3.3.1', bump: 'patch', createRelease: true })
  })

  it('releases a patch for a revert push', () => {
    const plan = planRelease({
      latestTag: 'v3.3.0',
      commitMessagesSinceTag: ['Revert "feat: add drag handles"\n\nThis reverts commit abc1234.'],
    })
    expect(plan).toMatchObject({ mode: 'bump', version: '3.3.1', bump: 'patch', createRelease: true })
  })

  it('releases a patch for a push of only chore/docs/build commits', () => {
    const plan = planRelease({
      latestTag: 'v3.3.0',
      commitMessagesSinceTag: ['chore: tidy imports', 'docs: fix a typo', 'build(deps): bump vite'],
    })
    expect(plan).toMatchObject({ mode: 'bump', version: '3.3.1', bump: 'patch', createRelease: true })
  })

  // The version is a FACT for every run, never absent: with no commits
  // since the tag (a workflow_dispatch re-run, or a re-run after a partial
  // failure) HEAD *is* that release, so the same version flows to both
  // publish jobs, which reconcile idempotently. Nothing is skipped away.
  it('reports the existing release version when there are no commits since the tag', () => {
    const plan = planRelease({ latestTag: 'v1.2.3', commitMessagesSinceTag: [] })
    expect(plan).toMatchObject({
      mode: 'already-released',
      version: '1.2.3',
      tag: 'v1.2.3',
      createRelease: false,
    })
  })

  it('never yields a plan without a version, whatever the input', () => {
    const inputs = [
      { latestTag: undefined, commitMessagesSinceTag: [] },
      { latestTag: 'v2.0.0', commitMessagesSinceTag: [] },
      { latestTag: 'v2.0.0', commitMessagesSinceTag: ['docs: nothing much'] },
    ]
    for (const input of inputs) {
      expect(planRelease(input).version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})
