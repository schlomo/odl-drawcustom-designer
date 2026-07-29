import { describe, expect, it } from 'vitest'
import {
  applyBump,
  bumpForCommit,
  gitTagListArgs,
  maxBump,
  parseCommitMessages,
  planRelease,
  versionFromTag,
} from '../../tools/autoRelease'

// Auto-release on push to main (issue #93, reworked 2026-07-29 per maintainer
// ruling: KISS, no PAT, tags as sole version source). A single workflow
// (.github/workflows/auto-release.yml) derives a semver bump from
// conventional-commit titles since the last `vX.Y.Z` tag reachable from
// HEAD, builds the library with that version injected, and publishes it as
// a GitHub release — which creates the tag. Nothing is pushed to main, so
// there is no bump commit and no loop guard. All decision logic lives here
// (thin CI, AGENTS.md); the CLI entry point (`import.meta.main` block in
// tools/autoRelease.ts) only does git/gh plumbing and the library build,
// exercised by the workflow itself, not by these tests.

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
    expect(plan).toMatchObject({ skip: false, mode: 'first-release', version: '1.0.0' })
  })

  it('first release ignores any commits since there is no tag to diff against', () => {
    const plan = planRelease({ latestTag: undefined, commitMessagesSinceTag: ['feat: whatever'] })
    expect(plan).toMatchObject({ skip: false, mode: 'first-release', version: '1.0.0' })
  })

  it('skips when a tag exists but there are no commits since it', () => {
    const plan = planRelease({ latestTag: 'v1.2.3', commitMessagesSinceTag: [] })
    expect(plan.skip).toBe(true)
  })

  it('bumps from the tag version when commits exist since the last tag', () => {
    const plan = planRelease({
      latestTag: 'v1.2.3',
      commitMessagesSinceTag: ['feat: add drag handles'],
    })
    expect(plan).toMatchObject({ skip: false, mode: 'bump', version: '1.3.0', bump: 'minor' })
  })

  it('takes the max bump across all commits since the last tag', () => {
    const plan = planRelease({
      latestTag: 'v1.0.0',
      commitMessagesSinceTag: ['fix: small tweak', 'feat: new option', 'chore: cleanup'],
    })
    expect(plan).toMatchObject({ skip: false, mode: 'bump', version: '1.1.0', bump: 'minor' })
  })

  it('fails loudly when the latest tag is malformed', () => {
    expect(() =>
      planRelease({
        latestTag: 'release-2026',
        commitMessagesSinceTag: ['fix: small tweak'],
      }),
    ).toThrow(/vX\.Y\.Z/)
  })
})
