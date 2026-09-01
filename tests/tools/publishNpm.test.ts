import { describe, expect, it } from 'vitest'
import { requirePublishVersion } from '../../tools/publishNpm'

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
