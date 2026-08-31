import { describe, expect, it } from 'vitest'
import { deriveSiteVersion } from '../../tools/siteVersion'

// The standalone site's production header shows a release version derived
// with the SAME bump algorithm tools/autoRelease.ts uses to pick the next
// release (see docs/releasing.md#site-version) — never `git describe
// --tags`, which would report the PREVIOUS release while the concurrent
// Auto Release workflow's new tag doesn't exist yet.

describe('deriveSiteVersion', () => {
  it('cannot derive anything when no vX.Y.Z tag is reachable from HEAD (shallow clone / fork / unreleased repo)', () => {
    expect(deriveSiteVersion({ latestTag: undefined, commitMessagesSinceTag: [] })).toBeUndefined()
  })

  it('ignores commits when there is no tag to diff against (still undefined, not first-release 1.0.0)', () => {
    expect(
      deriveSiteVersion({ latestTag: undefined, commitMessagesSinceTag: ['feat: whatever'] }),
    ).toBeUndefined()
  })

  it('reports the latest tag version when there are no commits since it (HEAD is that release)', () => {
    expect(deriveSiteVersion({ latestTag: 'v2.6.4', commitMessagesSinceTag: [] })).toBe('2.6.4')
  })

  it('bumps patch for a fix: commit since the last tag', () => {
    expect(
      deriveSiteVersion({ latestTag: 'v2.6.4', commitMessagesSinceTag: ['fix: correct anchor math'] }),
    ).toBe('2.6.5')
  })

  it('bumps minor for a feat: commit since the last tag', () => {
    expect(
      deriveSiteVersion({ latestTag: 'v2.6.4', commitMessagesSinceTag: ['feat: add drag handles'] }),
    ).toBe('2.7.0')
  })

  it('bumps major for a feat!: commit since the last tag', () => {
    expect(
      deriveSiteVersion({
        latestTag: 'v2.6.4',
        commitMessagesSinceTag: ['feat!: drop legacy mount option'],
      }),
    ).toBe('3.0.0')
  })

  it('bumps major for a BREAKING CHANGE footer among several commits', () => {
    expect(
      deriveSiteVersion({
        latestTag: 'v2.6.4',
        commitMessagesSinceTag: [
          'fix: correct anchor math',
          'feat: add drag handles',
          'fix: another thing\n\nBREAKING CHANGE: removes the old palette export',
        ],
      }),
    ).toBe('3.0.0')
  })

  it('takes the highest bump across multiple commits since the tag', () => {
    expect(
      deriveSiteVersion({
        latestTag: 'v1.0.0',
        commitMessagesSinceTag: ['fix: a', 'feat: b', 'fix: c'],
      }),
    ).toBe('1.1.0')
  })
})
