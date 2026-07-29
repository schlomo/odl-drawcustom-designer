import { describe, expect, it } from 'vitest'
import { resolveAppVersion } from '../../tools/version'

// Runtime version reporting (issue #23, reworked 2026-07-29: tags are the
// sole version source — package.json stays pinned at 0.0.0 forever). The
// release script (tools/autoRelease.ts) sets an env var (APP_VERSION) for
// the library build it triggers; baked in at build time via a `define`
// (like tools/gitRevision.ts's branch/revision labels) so a host can log
// which designer build it embeds. A non-release build (local dev, CI
// checks) has no APP_VERSION set and falls back to '0.0.0-dev' — the one
// documented silent fallback (AGENTS.md, "fail loudly ... exception").
// Follows the same `vitest:` short-circuit guard (AGENTS.md, "Build-time
// defines") so the Vitest runtime never depends on build-time state.

describe('resolveAppVersion', () => {
  it('returns test under Vitest, regardless of envVersion', () => {
    expect(resolveAppVersion({ vitest: true, envVersion: '1.2.3' })).toBe('test')
  })

  it('uses the provided env version', () => {
    expect(resolveAppVersion({ envVersion: '0.1.0' })).toBe('0.1.0')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveAppVersion({ envVersion: ' 0.1.0 \n' })).toBe('0.1.0')
  })

  it('falls back to 0.0.0-dev when no version is available (non-release build)', () => {
    expect(resolveAppVersion({})).toBe('0.0.0-dev')
  })

  it('falls back to 0.0.0-dev for an empty/whitespace-only version', () => {
    expect(resolveAppVersion({ envVersion: '   ' })).toBe('0.0.0-dev')
  })
})
