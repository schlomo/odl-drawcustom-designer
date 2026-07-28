import { describe, expect, it } from 'vitest'
import { assertTagMatchesPackageVersion, versionFromTag } from '../../tools/releaseVersion'

// Tag-driven release workflow (issue #23): the release workflow's only
// validation logic lives here (thin CI, AGENTS.md), so it's independently
// testable without pushing a tag. The pushed `vX.Y.Z` tag must match
// package.json's version — the tag is what the artifact's baked-in version
// (tools/version.ts) will show, so a mismatch means the artifact would lie.

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

describe('assertTagMatchesPackageVersion', () => {
  it('passes silently when the tag matches package.json version', () => {
    expect(() =>
      assertTagMatchesPackageVersion({ tag: 'v0.1.0', packageVersion: '0.1.0' }),
    ).not.toThrow()
  })

  it('throws when the tag version does not match package.json version', () => {
    expect(() =>
      assertTagMatchesPackageVersion({ tag: 'v0.2.0', packageVersion: '0.1.0' }),
    ).toThrow(/does not match/)
  })
})
