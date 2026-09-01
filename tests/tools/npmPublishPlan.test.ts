import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkNpmRegistryHasVersion,
  compareSemver,
  NPM_PUBLISH_CUTOFF_VERSION,
  planNpmPublish,
} from '../../tools/npmPublishPlan'

// The npm job's publish decision. It runs in parallel with the Pages deploy
// and after the release/tag already exists, so publishing must be idempotent:
// re-running the failed job alone is the recovery path for a publish that
// died after `gh release create` (AGENTS.md, "re-running is the upgrade
// path"). planNpmPublish is the pure decision; checkNpmRegistryHasVersion is
// the read-only network check, kept separate so the decision itself needs no
// fetch mocking.

describe('compareSemver', () => {
  it('is zero for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  it('is negative when the first version is lower', () => {
    expect(compareSemver('1.0.4', '1.1.0')).toBeLessThan(0)
  })

  it('is positive when the first version is higher', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('compares numerically per segment, not lexicographically (1.9.0 < 1.10.0)', () => {
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0)
  })

  it('throws loudly on a malformed version', () => {
    expect(() => compareSemver('1.2', '1.2.0')).toThrow(/semver/)
  })
})

describe('planNpmPublish', () => {
  it('skips when npm publishing is not enabled, even for a version missing from the registry', () => {
    const decision = planNpmPublish({
      version: '1.2.0',
      npmPublishEnabled: false,
      npmHasVersion: false,
    })
    expect(decision).toMatchObject({ action: 'skip' })
    expect(decision.reason).toMatch(/NPM_PUBLISH/)
  })

  it('skips a version below the npm-publish cutoff, even when enabled and missing from the registry', () => {
    // v1.0.0-v1.0.4 predate npm publishing entirely (issue #103) — must
    // never be retroactively published by a later run.
    const decision = planNpmPublish({
      version: '1.0.4',
      npmPublishEnabled: true,
      npmHasVersion: false,
    })
    expect(decision).toMatchObject({ action: 'skip' })
    expect(decision.reason).toMatch(/predates npm publishing/)
  })

  it('skips exactly at the cutoff version when the registry already has it', () => {
    const decision = planNpmPublish({
      version: NPM_PUBLISH_CUTOFF_VERSION,
      npmPublishEnabled: true,
      npmHasVersion: true,
    })
    expect(decision).toMatchObject({ action: 'skip' })
    expect(decision.reason).toMatch(/already published/)
  })

  it('publishes a cutoff-or-later version missing from the registry', () => {
    const decision = planNpmPublish({
      version: '1.1.0',
      npmPublishEnabled: true,
      npmHasVersion: false,
    })
    expect(decision).toMatchObject({ action: 'publish', version: '1.1.0' })
    expect(decision.reason).toMatch(/v1\.1\.0 is missing from the npm registry/)
  })

  it('publishes a later version too, not just exactly the cutoff', () => {
    const decision = planNpmPublish({
      version: '2.4.1',
      npmPublishEnabled: true,
      npmHasVersion: false,
    })
    expect(decision).toMatchObject({ action: 'publish', version: '2.4.1' })
  })

  // Re-running the npm job after a successful publish (the "re-run failed
  // jobs" recovery path when only the Pages job failed) must be a clean
  // no-op, never a duplicate-version publish error.
  it('is a clean skip when the run\'s version is already on the registry', () => {
    const decision = planNpmPublish({ version: '3.4.0', npmPublishEnabled: true, npmHasVersion: true })
    expect(decision).toMatchObject({ action: 'skip' })
    expect(decision.reason).toMatch(/already published/)
  })
})

describe('checkNpmRegistryHasVersion', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns true when the registry responds 200 for that exact version', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(checkNpmRegistryHasVersion('odl-drawcustom-designer', '1.1.0')).resolves.toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('https://registry.npmjs.org/odl-drawcustom-designer/1.1.0')
  })

  it('returns false on a 404 (version not published)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(checkNpmRegistryHasVersion('odl-drawcustom-designer', '1.1.0')).resolves.toBe(false)
  })

  it('throws loudly on a non-404 error status (registry outage must not read as "not published")', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }))
    await expect(checkNpmRegistryHasVersion('odl-drawcustom-designer', '1.1.0')).rejects.toThrow(/HTTP 500/)
  })

  it('throws loudly when the fetch itself fails (network down)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    await expect(checkNpmRegistryHasVersion('odl-drawcustom-designer', '1.1.0')).rejects.toThrow(
      /npm registry check failed/,
    )
  })

  it('URL-encodes the "/" in a scoped package name as %2F (registry API convention, docs.npmjs.com)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(checkNpmRegistryHasVersion('@schlomo/odl-drawcustom-designer', '1.1.0')).resolves.toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@schlomo%2Fodl-drawcustom-designer/1.1.0',
    )
  })
})
