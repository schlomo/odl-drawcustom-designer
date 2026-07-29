import { describe, expect, it } from 'vitest'
import {
  applyBump,
  bumpForCommit,
  isReleaseCommit,
  maxBump,
  parseCommitMessages,
  planRelease,
} from '../../tools/autoRelease'

// Auto-release on push to main (issue #93): a push-to-main workflow derives
// a semver bump from conventional-commit titles since the last `vX.Y.Z`
// tag, bumps package.json, commits, tags, and pushes — the pushed tag then
// triggers the existing tag-driven release.yml (issue #23), which stays
// untouched. All decision logic lives here (thin CI, AGENTS.md); the CLI
// entry point (`import.meta.main` block in tools/autoRelease.ts) only does
// git plumbing (reading tags/log, writing/committing/tagging/pushing) and
// is exercised manually, not by these tests.

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

describe('isReleaseCommit', () => {
  it('recognizes the release-bump commit prefix', () => {
    expect(isReleaseCommit('chore(release): v1.2.3')).toBe(true)
  })

  it('is not fooled by leading/trailing whitespace', () => {
    expect(isReleaseCommit('  chore(release): v1.2.3  ')).toBe(true)
  })

  it('rejects an unrelated chore commit', () => {
    expect(isReleaseCommit('chore: tidy imports')).toBe(false)
  })

  it('rejects a feat commit', () => {
    expect(isReleaseCommit('feat: add drag handles')).toBe(false)
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

describe('planRelease', () => {
  it('skips when HEAD is a release-bump commit (loop guard), even with pending commits', () => {
    const plan = planRelease({
      headSubject: 'chore(release): v1.2.3',
      latestTag: 'v1.2.2',
      packageVersion: '1.2.2',
      commitMessagesSinceTag: ['feat: something'],
    })
    expect(plan.skip).toBe(true)
  })

  it('first release: no tag yet releases the current package.json version as-is, with no bump', () => {
    const plan = planRelease({
      headSubject: 'docs: update readme',
      latestTag: undefined,
      packageVersion: '1.0.0',
      commitMessagesSinceTag: [],
    })
    expect(plan).toMatchObject({ skip: false, mode: 'first-release', version: '1.0.0' })
  })

  it('skips when a tag exists but there are no commits since it', () => {
    const plan = planRelease({
      headSubject: 'chore(release): v1.2.3',
      latestTag: 'v1.2.3',
      packageVersion: '1.2.3',
      commitMessagesSinceTag: [],
    })
    expect(plan.skip).toBe(true)
  })

  it('bumps from the tag version (not package.json) when commits exist since the last tag', () => {
    const plan = planRelease({
      headSubject: 'feat: add drag handles',
      latestTag: 'v1.2.3',
      // Deliberately diverges from the tag to prove the tag is the source
      // of truth for the base version, matching releaseVersion.ts's policy.
      packageVersion: '9.9.9',
      commitMessagesSinceTag: ['feat: add drag handles'],
    })
    expect(plan).toMatchObject({ skip: false, mode: 'bump', version: '1.3.0', bump: 'minor' })
  })

  it('takes the max bump across all commits since the last tag', () => {
    const plan = planRelease({
      headSubject: 'fix: small tweak',
      latestTag: 'v1.0.0',
      packageVersion: '1.0.0',
      commitMessagesSinceTag: ['fix: small tweak', 'feat: new option', 'chore: cleanup'],
    })
    expect(plan).toMatchObject({ skip: false, mode: 'bump', version: '1.1.0', bump: 'minor' })
  })

  it('fails loudly when the latest tag is malformed', () => {
    expect(() =>
      planRelease({
        headSubject: 'fix: small tweak',
        latestTag: 'release-2026',
        packageVersion: '1.0.0',
        commitMessagesSinceTag: ['fix: small tweak'],
      }),
    ).toThrow(/vX\.Y\.Z/)
  })
})
