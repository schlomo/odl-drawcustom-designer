import { describe, expect, it } from 'vitest'
import { ghReleaseCreateArgs, requireReleaseEnv } from '../../tools/createRelease'

// Step two of the release pipeline: build the library at the version the
// `version` job already computed and — when this run owns that version —
// create the tag + GitHub release. It must NEVER derive a version of its
// own (maintainer ruling 2026-09-01, "compute the version ONCE, up front"),
// so everything it needs arrives through the environment and is validated
// loudly here, before the slow build.

describe('requireReleaseEnv', () => {
  const base = { APP_VERSION: '3.4.0', CREATE_RELEASE: 'true', GITHUB_SHA: 'abc123', GH_TOKEN: 'secret' }

  it('accepts a complete release environment', () => {
    expect(requireReleaseEnv(base)).toEqual({ version: '3.4.0', createRelease: true, targetSha: 'abc123' })
  })

  it('throws loudly when APP_VERSION is missing — it must come from the version job, never be derived here', () => {
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: undefined })).toThrow(/APP_VERSION/)
  })

  it('throws loudly when APP_VERSION is not a plain X.Y.Z version', () => {
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: '0.0.0-dev' })).toThrow(/APP_VERSION/)
    expect(() => requireReleaseEnv({ ...base, APP_VERSION: 'v3.4.0' })).toThrow(/APP_VERSION/)
  })

  it('throws loudly when GITHUB_SHA is missing', () => {
    expect(() => requireReleaseEnv({ ...base, GITHUB_SHA: undefined })).toThrow(/GITHUB_SHA/)
  })

  it('throws loudly when GH_TOKEN is missing and a release must be created', () => {
    expect(() => requireReleaseEnv({ ...base, GH_TOKEN: undefined })).toThrow(/GH_TOKEN/)
  })

  it('does not require GH_TOKEN when the release already exists (nothing will be created)', () => {
    expect(requireReleaseEnv({ ...base, CREATE_RELEASE: 'false', GH_TOKEN: undefined })).toEqual({
      version: '3.4.0',
      createRelease: false,
      targetSha: 'abc123',
    })
  })

  // A job output that arrives empty or misspelled must not be read as
  // "false" — that would silently skip creating the release for a version
  // both publish jobs then go on to publish.
  it('throws loudly on a CREATE_RELEASE value that is neither "true" nor "false"', () => {
    for (const value of [undefined, '', 'yes', 'TRUE', '1']) {
      expect(() => requireReleaseEnv({ ...base, CREATE_RELEASE: value })).toThrow(/CREATE_RELEASE/)
    }
  })
})

describe('ghReleaseCreateArgs', () => {
  it('pins the tag to the exact commit that was gated, and attaches every asset', () => {
    const args = ghReleaseCreateArgs('v3.4.0', 'abc123', ['dist-lib/lib.js', 'LICENSE'])
    expect(args.slice(0, 3)).toEqual(['release', 'create', 'v3.4.0'])
    expect(args).toContain('dist-lib/lib.js')
    expect(args).toContain('LICENSE')
    const targetIndex = args.indexOf('--target')
    expect(targetIndex).toBeGreaterThan(-1)
    expect(args[targetIndex + 1]).toBe('abc123')
  })

  it('titles the release with the tag and generates notes', () => {
    const args = ghReleaseCreateArgs('v3.4.0', 'abc123', [])
    expect(args[args.indexOf('--title') + 1]).toBe('v3.4.0')
    expect(args).toContain('--generate-notes')
  })
})
