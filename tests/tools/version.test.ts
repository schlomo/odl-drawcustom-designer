import { describe, expect, it } from 'vitest'
import { resolveAppVersion } from '../../tools/version'

// Runtime version reporting (issue #23): package.json's version is the
// single source of truth, baked in at build time via a `define` (like
// tools/gitRevision.ts's branch/revision labels) so a host can log which
// designer build it embeds. Follows the same `vitest:` short-circuit guard
// (AGENTS.md, "Build-time defines") so the Vitest runtime never depends on
// build-time state.

describe('resolveAppVersion', () => {
  it('returns test under Vitest, regardless of packageVersion', () => {
    expect(resolveAppVersion({ vitest: true, packageVersion: '1.2.3' })).toBe('test')
  })

  it('uses the provided package.json version', () => {
    expect(resolveAppVersion({ packageVersion: '0.1.0' })).toBe('0.1.0')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveAppVersion({ packageVersion: ' 0.1.0 \n' })).toBe('0.1.0')
  })

  it('falls back to 0.0.0 when no version is available', () => {
    expect(resolveAppVersion({})).toBe('0.0.0')
  })

  it('falls back to 0.0.0 for an empty/whitespace-only version', () => {
    expect(resolveAppVersion({ packageVersion: '   ' })).toBe('0.0.0')
  })
})
