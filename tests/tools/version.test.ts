import { describe, expect, it } from 'vitest'
import { resolveAppVersion } from '../../tools/version'

// Version reporting (issue #23; ONE version define since 2026-09-01). The
// release pipeline computes the version once (tools/releaseVersion.ts) and
// sets APP_VERSION for every build in that run — the library build and the
// standalone site build alike — baked in via a `define` (like
// tools/gitRevision.ts's branch/revision labels) so a host can log which
// designer build it embeds and the site header can label itself. A
// non-release build (local dev, CI checks, a PR preview) has no APP_VERSION
// set and falls back to '0.0.0-dev' — the one documented silent fallback
// (AGENTS.md, "fail loudly ... exception"), which src/core/buildInfo.ts's
// isReleasedVersion rejects so the header shows branch + SHA instead.
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
