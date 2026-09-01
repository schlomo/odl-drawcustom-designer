import { describe, expect, it } from 'vitest'
import { ghReleaseDownloadArgs, requirePublishVersion } from '../../tools/publishNpm'

// The npm job consumes the version the `version` job computed; it must never
// fall back to a placeholder or re-derive one of its own (maintainer ruling
// 2026-09-01, "compute the version ONCE, up front"). Publishing
// `0.0.0-dev` to the registry would be unrecoverable — npm never lets a
// version be republished.

describe('requirePublishVersion', () => {
  it('returns the version the version job computed', () => {
    expect(requirePublishVersion({ APP_VERSION: '3.4.0' })).toBe('3.4.0')
  })

  it('trims surrounding whitespace from a job output', () => {
    expect(requirePublishVersion({ APP_VERSION: ' 3.4.0\n' })).toBe('3.4.0')
  })

  it('throws loudly when APP_VERSION is unset', () => {
    expect(() => requirePublishVersion({})).toThrow(/APP_VERSION/)
  })

  it('refuses the dev placeholder rather than publishing it', () => {
    expect(() => requirePublishVersion({ APP_VERSION: '0.0.0-dev' })).toThrow(/APP_VERSION/)
  })

  it('refuses a v-prefixed tag (the tag is not the version)', () => {
    expect(() => requirePublishVersion({ APP_VERSION: 'v3.4.0' })).toThrow(/APP_VERSION/)
  })
})

// The published bytes come from the GitHub release, not from a workflow
// artifact (Copilot review, PR #183): artifacts are scoped to a workflow run
// and their cross-ATTEMPT visibility is not pinned down by the action's
// docs, while "re-run the failed npm job alone" is this pipeline's headline
// recovery path. The release is authoritative, complete by then, and
// outlives artifact retention.

describe('ghReleaseDownloadArgs', () => {
  it('downloads exactly the assets staging needs, and nothing else', () => {
    const args = ghReleaseDownloadArgs('v3.4.2', '/tmp/dist-lib')
    expect(args.slice(0, 3)).toEqual(['release', 'download', 'v3.4.2'])
    const patterns = args.filter((_, i) => args[i - 1] === '--pattern')
    expect(patterns.sort()).toEqual(
      ['THIRD_PARTY.md', 'odl-drawcustom-designer.d.ts', 'odl-drawcustom-designer.js'].sort(),
    )
  })

  it('does not pull the .sha256 assets, which the npm tarball never ships', () => {
    expect(ghReleaseDownloadArgs('v3.4.2', '/tmp/d').some((a) => a.endsWith('.sha256'))).toBe(false)
  })

  it('targets the given directory and clobbers, so a re-run converges', () => {
    const args = ghReleaseDownloadArgs('v3.4.2', '/tmp/dist-lib')
    expect(args[args.indexOf('--dir') + 1]).toBe('/tmp/dist-lib')
    expect(args).toContain('--clobber')
  })
})
